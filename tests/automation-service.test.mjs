import { test } from "node:test";
import assert from "node:assert/strict";
import { createAutomationService } from "../src/services/automation-service.js";
import { ensureAutomation } from "../src/state/automation-store.js";

function fixture(processRange) {
    const chat = Array.from({ length: 30 }, () => ({ mes: "source" }));
    const store = {};
    const config = ensureAutomation(store, "a"); config.mode = "draft";
    let key = "a";
    const host = { identity: () => ({ key }), context: () => ({ chat }), busy: () => false,
        capable: () => true, assertCurrent: t => { if (t.key !== key) throw new Error("changed"); },
        lock: async (_, action) => action(), read: async () => ({ store: structuredClone(store), messages: chat }) };
    const service = createAutomationService({ host, getStore: () => store,
        getSettings: () => ({ summaryGenerationMode: "independent-api", independentApiConfig: { apiUrl: "url", model: "model" } }),
        processRange });
    return { service, config, store, switch: () => { key = "b"; service.chatChanged(); } };
}
test("concurrent triggers share one active run, never recursively drain history", async () => {
    let calls = 0;
    const f = fixture(async ({ config }) => { calls++; config.pending = { id: "draft" }; });
    await Promise.all([f.service.run(), f.service.run()]);
    await f.service.run();
    assert.equal(calls, 1);
});
test("cancel and chat switch invalidate in-flight work", async () => {
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    let committed = false;
    const f = fixture(async ({ assertValid }) => { await barrier; assertValid(); committed = true; });
    const running = f.service.run();
    await new Promise(resolve => setImmediate(resolve));
    f.switch(); release(); await running;
    assert.equal(committed, false);
});
test("paused and manual chats do not request generation", async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; });
    f.config.paused = true; await f.service.run();
    f.config.paused = false; f.config.mode = "manual"; await f.service.run();
    assert.equal(calls, 0);
});
