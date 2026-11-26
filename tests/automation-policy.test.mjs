import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAutomaticRange } from "../src/services/automation-policy.js";
const messages = n => Array.from({ length: n }, () => ({ mes: "source" }));
const config = { batchSize: 20, keepRecent: 10 };
const approved = [{ startMes: 0, endMes: 19, sourceHash: "verified" }];
test("N20/K10 thresholds select oldest eligible complete batch", () => {
    assert.equal(selectAutomaticRange(messages(29), [], config).reason, "waiting");
    assert.deepEqual(selectAutomaticRange(messages(30), [], config).range, { startMes: 0, endMes: 19, startFloor: 1, endFloor: 20 });
    assert.equal(selectAutomaticRange(messages(49), approved, config).reason, "waiting");
    assert.equal(selectAutomaticRange(messages(50), approved, config).range.startMes, 20);
});
test("full coverage does not fall back to resummarizing the tail", () => {
    assert.equal(selectAutomaticRange(messages(20), approved, config).reason, "waiting");
});
test("gaps, stale ranges, hidden source and invalid config fail closed", () => {
    assert.equal(selectAutomaticRange(messages(50), [{ ...approved[0], startMes: 10 }], config).reason, "range-gap");
    assert.equal(selectAutomaticRange(messages(50), [{ ...approved[0], changed: true }], config).reason, "source-changed");
    const chat = messages(30); chat[2].is_system = true;
    assert.equal(selectAutomaticRange(chat, [], config).reason, "hidden-source");
    assert.equal(selectAutomaticRange(chat, [], { ...config, keepRecent: 0 }).reason, "invalid-config");
});
