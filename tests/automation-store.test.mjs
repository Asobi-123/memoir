import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureAutomation, compactDraft, summarySnapshot, sameSummary, appendSummaryToStore } from "../src/state/automation-store.js";

test("new and copied chats default to manual without inherited permission", () => {
    const store = { cumulativeSummary: "keep", unknown: 7 };
    assert.equal(ensureAutomation(store, "a").mode, "manual");
    store.automation.mode = "auto-approve";
    store.automation.journal = { id: "previous" };
    assert.equal(ensureAutomation(store, "b").mode, "manual");
    assert.equal(store.automation.journal, null);
    assert.equal(store.cumulativeSummary, "keep");
    assert.equal(store.unknown, 7);
});
test("unknown schema fails closed and is not overwritten", () => {
    const store = { automation: { schemaVersion: 99, ownerChatKey: "a", mode: "auto-approve", future: true } };
    assert.equal(ensureAutomation(store, "a").reason, "unsupported-state");
    assert.equal(store.automation.schemaVersion, 99);
});
test("compact pending output never persists request credentials", () => {
    const draft = compactDraft({ id: "d", chatKey: "a", request: { apiKey: "secret" },
        range: { startMes: 0, endMes: 1 }, response: { archiveSummary: "body" },
        providerInfo: { model: "model", fallbackReason: "secret" } });
    assert.equal(JSON.stringify(draft).includes("secret"), false);
    assert.equal(draft.response.archiveSummary, "body");
});
test("task id is an idempotency key and snapshots detect later edits", () => {
    const store = {};
    const draft = { id: "d", range: { startMes: 0, endMes: 1 }, sourceHash: "h", response: { archiveSummary: "body" } };
    assert.equal(appendSummaryToStore(store, draft, "t"), true);
    assert.equal(appendSummaryToStore(store, draft, "t"), false);
    assert.equal(store.approvedRanges.length, 1);
    const snap = summarySnapshot(store);
    store.cumulativeSummary += "edit";
    assert.equal(sameSummary(store, snap), false);
});
