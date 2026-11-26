import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./automation-fixture.mjs";
import { summarySnapshot } from "../src/state/automation-store.js";

test("undo restores originals before removing their summary and pauses automation", async () => {
    const f = await fixture(); f.state.hideAfterApprove = true;
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    f.events.length = 0;
    f.chat.push({ name: "A", mes: "new tail" });
    await f.actions.undo({ key: "a" });
    assert.equal(f.chat.some(m => m.is_system), false);
    assert.equal(f.store.cumulativeSummary, "");
    assert.equal(f.state.journal.phase, "undone");
    assert.equal(f.state.paused, true);
    assert.ok(f.events.indexOf("unhide") < f.events.lastIndexOf("save"));
});
test("undo refuses to overwrite subsequent edits", async () => {
    const f = await fixture();
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    f.store.cumulativeSummary += "human edit";
    await assert.rejects(f.actions.undo({ key: "a" }), { code: "summary-changed" });
    assert.ok(f.store.cumulativeSummary.endsWith("human edit"));
});
test("manually approving automatic draft does not hide, even if option enabled", async () => {
    const f = await fixture(); f.state.hideAfterApprove = true; f.state.pending = f.draft;
    await f.actions.acceptPending({ key: "a" });
    assert.equal(f.chat.some(m => m.is_system), false);
    assert.equal(f.state.paused, true);
});
