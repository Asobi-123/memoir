import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./automation-fixture.mjs";
import { createAutomationService } from "../src/services/automation-service.js";
import { summarySnapshot } from "../src/state/automation-store.js";

function service(f) {
    return createAutomationService({ host: f.host, getStore: () => f.store, getSettings: () => f.settings,
        processRange: f.actions.processRange, actions: f.actions });
}
test("full automatic chain persists once; subsequent triggers do not summarize covered history", async () => {
    const f = await fixture();
    const runtime = service(f);
    await runtime.run();
    assert.equal(f.state.status, "completed");
    assert.equal(f.state.paused, false);
    assert.equal(f.disk().store.approvedRanges.length, 1);
    await runtime.run();
    assert.equal(f.store.approvedRanges.length, 1);
    assert.equal(f.state.reason, "");
});
test("automatic draft persists across reload without adoption or hiding", async () => {
    const f = await fixture(); f.state.mode = "draft";
    // Persist the user-selected mode before evaluating the background task.
    await f.actions.saveState({ key: "a" });
    await service(f).run();
    assert.equal(f.disk().store.automation.pending.response.archiveSummary, "The team arrived.");
    assert.equal(f.store.approvedRanges, undefined);
    assert.equal(f.chat.some(m => m.is_system), false);
});
test("local fallback requires manual review in automatic adoption mode", async () => {
    let f;
    f = await fixture({ generate: async () => ({ ...f.draft, providerInfo: { localFallbackUsed: true } }) });
    await service(f).run();
    assert.equal(f.state.reason, "result-needs-review");
    assert.equal(f.disk().store.automation.pending.providerInfo.localFallbackUsed, true);
    assert.equal(f.store.approvedRanges, undefined);
});
test("visibility changed while generating blocks adoption", async () => {
    let f;
    f = await fixture({ generate: async () => { await f.host.hide({ key: "a" }, [0], true); return f.draft; } });
    await service(f).run();
    assert.equal(f.state.reason, "hidden-source");
    assert.equal(f.store.approvedRanges, undefined);
});
test("injection failure keeps saved summary but does not hide originals", async () => {
    const f = await fixture({ canInject: () => ({ ready: false, reason: "injection-disabled" }) });
    f.state.hideAfterApprove = true; await f.actions.saveState({ key: "a" });
    await service(f).run();
    assert.equal(f.store.approvedRanges.length, 1);
    assert.equal(f.chat.some(m => m.is_system), false);
    assert.equal(f.state.reason, "injection-disabled");
});
test("unconfirmed initial save can be reconciled back to a reviewable draft", async () => {
    const f = await fixture();
    f.failSave(true);
    await assert.rejects(f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store)));
    f.failSave(false);
    await f.actions.recover({ key: "a" });
    assert.equal(f.store.cumulativeSummary, "");
    assert.equal(f.state.pending.id, "task-1");
    assert.equal(f.state.paused, true);
});

test("two tabs cannot run the same request and stale tab cannot overwrite adoption", async () => {
    let release, entered;
    const barrier = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let calls = 0, f;
    f = await fixture({ generate: async () => { calls++; entered(); await barrier; return f.draft; } });
    let locked = false;
    f.host.lock = async (_, action) => {
        if (locked) throw Object.assign(new Error("another-tab"), { code: "another-tab" });
        locked = true;
        try { return await action(); } finally { locked = false; }
    };
    const staleStore = structuredClone(f.store);
    const stale = createAutomationService({ host: f.host, getStore: () => staleStore, getSettings: () => f.settings,
        processRange: async () => { calls++; } });
    const first = service(f).run(); await started;
    await stale.run(); assert.equal(stale.state().reason, "another-tab");
    release(); await first;
    stale.state().paused = false; await stale.run();
    assert.equal(stale.state().reason, "stale-tab");
    assert.equal(calls, 1);
    assert.equal(f.disk().store.approvedRanges.length, 1);
});

test("a failed final undo save remains recoverable and does not re-hide originals", async () => {
    const f = await fixture(); f.state.hideAfterApprove = true;
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    const save = f.host.save;
    f.host.save = async (...args) => {
        if (f.state.journal.phase === "undone") throw Object.assign(new Error("save-unconfirmed"), { code: "save-unconfirmed" });
        return save(...args);
    };
    await assert.rejects(f.actions.undo({ key: "a" }));
    assert.equal(journal.phase, "originals-restored");
    assert.equal(f.chat.some(m => m.is_system), false);
    f.host.save = save;
    await f.actions.recover({ key: "a" });
    assert.equal(journal.phase, "undone");
    assert.equal(f.disk().store.cumulativeSummary, "");
});

test("a failed final adoption save preserves a nonterminal recovery journal", async () => {
    const f = await fixture();
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    const save = f.host.save;
    f.host.save = async (...args) => {
        if (journal.phase === "completed") throw Object.assign(new Error("read-failed"), { code: "read-failed" });
        return save(...args);
    };
    await assert.rejects(f.actions.finish({ key: "a" }, journal));
    assert.equal(journal.phase, "saved");
    f.host.save = save;
    await f.actions.recover({ key: "a" });
    assert.equal(f.store.approvedRanges.length, 1);
    assert.equal(journal.phase, "completed");
});

test("changed archived source is checked even before the UI stale flag updates", async () => {
    let calls = 0;
    const f = await fixture({ generate: async () => { calls++; throw new Error("must not run"); } });
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    f.chat[0].mes = "changed historical fact";
    f.chat.push(...Array.from({ length: 20 }, () => ({ name: "A", mes: "new tail" })));
    await f.host.save({ key: "a" }, () => true);
    await service(f).run();
    assert.equal(calls, 0);
    assert.equal(f.state.reason, "source-changed");
    assert.equal(f.disk().store.automation.paused, true);
});

test("saved configuration changes during generation retain result for human review", async () => {
    let f;
    f = await fixture({ generate: async () => { f.settings.independentApiConfig.model = "different"; return f.draft; } });
    await service(f).run();
    assert.equal(f.state.reason, "settings-changed");
    assert.equal(f.state.pending.id, "task-1");
    assert.equal(f.store.approvedRanges, undefined);
});
