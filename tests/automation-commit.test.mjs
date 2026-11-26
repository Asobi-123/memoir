import { test } from "node:test";
import assert from "node:assert/strict";
import { summarySnapshot } from "../src/state/automation-store.js";
import { fixture } from "./automation-fixture.mjs";

test("commit is saved with task id and no hidden messages", async () => {
    const f = await fixture();
    await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    assert.equal(f.disk().store.approvedRanges[0].taskId, "task-1");
    assert.equal(f.chat.some(m => m.is_system), false);
    await assert.rejects(f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store)), { code: "range-overlap" });
    assert.equal(f.store.approvedRanges.length, 1);
});
test("failed saving preserves journal and never hides", async () => {
    const f = await fixture(); f.failSave(true);
    await assert.rejects(f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store)), { code: "save-unconfirmed" });
    assert.equal(f.state.journal.phase, "committing");
    assert.equal(f.events.includes("hide"), false);
});
test("interrupted saved commit recovers without appending or generating", async () => {
    const f = await fixture();
    await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.recover({ key: "a" });
    assert.equal(f.store.approvedRanges.length, 1);
    assert.equal(f.state.journal.phase, "completed");
    assert.equal(f.state.paused, true);
});
test("source edits and concurrent summary edits block commit", async () => {
    const f = await fixture();
    const before = summarySnapshot(f.store);
    f.chat[0].mes = "edited";
    await assert.rejects(f.actions.commit({ key: "a" }, f.draft, before), { code: "source-changed" });
    assert.equal(f.store.approvedRanges, undefined);
});
