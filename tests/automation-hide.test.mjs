import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./automation-fixture.mjs";
import { summarySnapshot } from "../src/state/automation-store.js";

test("hiding only follows verified summary saving and preserves recent messages", async () => {
    const f = await fixture(); f.state.hideAfterApprove = true;
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    assert.ok(f.events.indexOf("save") < f.events.indexOf("hide"));
    assert.equal(f.chat.slice(0, 20).every(m => m.is_system), true);
    assert.equal(f.chat.slice(20).some(m => m.is_system), false);
    assert.equal(f.state.journal.phase, "completed");
});
test("disabled hiding never changes visibility", async () => {
    const f = await fixture();
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    await f.actions.finish({ key: "a" }, journal);
    assert.equal(f.events.includes("hide"), false);
});
test("interrupted hide restores originals, retaining the saved summary", async () => {
    const f = await fixture();
    const journal = await f.actions.commit({ key: "a" }, f.draft, summarySnapshot(f.store));
    journal.phase = "hiding"; journal.hiddenIndexes = [0, 1];
    await f.host.hide({ key: "a" }, [0, 1], true);
    await f.actions.recover({ key: "a" });
    assert.equal(f.chat[0].is_system, false);
    assert.equal(f.store.approvedRanges.length, 1);
    assert.equal(f.state.paused, true);
});
