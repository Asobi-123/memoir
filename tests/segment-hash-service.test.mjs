import { test } from "node:test";
import assert from "node:assert/strict";
import { hashMessageRange } from "../src/services/segment-hash-service.js";

test("v2 separates source changes from visibility; legacy hashes remain verifiable", async () => {
    const source = [{ name: "A", mes: "text", is_system: false }];
    const hidden = [{ ...source[0], is_system: true }];
    assert.equal(await hashMessageRange(source), await hashMessageRange(hidden));
    assert.equal(await hashMessageRange(source), await hashMessageRange([{ ...source[0], swipe_id: 0 }]));
    assert.notEqual(await hashMessageRange(source, 1), await hashMessageRange(hidden, 1));
    assert.notEqual(await hashMessageRange(source), await hashMessageRange([{ ...source[0], mes: "edited" }]));
    assert.notEqual(await hashMessageRange(source), await hashMessageRange([{ ...source[0], swipe_id: 1 }]));
});
