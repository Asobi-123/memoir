import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./automation-fixture.mjs";
import { summarySnapshot } from "../src/state/automation-store.js";

test("draft validation rejects source edit while hash completion is pending", async () => {
    const f = await fixture();
    const validation = f.actions.validateDraft(f.host.identity(), f.draft, summarySnapshot(f.store));
    f.chat[0].mes = "changed after hash input captured";
    await assert.rejects(validation, /source-changed/);
});

test("draft validation rejects visibility edit while hash completion is pending", async () => {
    const f = await fixture();
    const validation = f.actions.validateDraft(f.host.identity(), f.draft, summarySnapshot(f.store));
    f.chat[0].is_system = true;
    await assert.rejects(validation, /source-changed/);
});
