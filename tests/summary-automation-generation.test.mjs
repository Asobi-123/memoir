import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAutomaticResultUsable, automaticProviderReady } from "../src/services/automation-policy.js";

test("automatic admission rejects fallback, warning and known refusal text", () => {
    const draft = { response: { archiveSummary: "The team arrived at the station." }, providerInfo: {} };
    assert.equal(isAutomaticResultUsable(draft), true);
    assert.equal(isAutomaticResultUsable({ ...draft, providerInfo: { localFallbackUsed: true } }), false);
    assert.equal(isAutomaticResultUsable({ ...draft, providerInfo: { fallbackUsed: true } }), false);
    assert.equal(isAutomaticResultUsable({ ...draft, response: { ...draft.response, parseError: "warning" } }), false);
    assert.equal(isAutomaticResultUsable({ ...draft, response: { archiveSummary: "I cannot help with that" } }), false);
    assert.equal(automaticProviderReady({ summaryGenerationMode: "shared-api" }), "shared-api-unavailable");
    assert.equal(automaticProviderReady({ summaryGenerationMode: "independent-api" }), "provider-incomplete");
});

test("custom requests keep captured credentials/model and cancellation is local", async () => {
    let code = await readFile(new URL("../src/services/providers/custom-provider.js", import.meta.url), "utf8");
    code = code.replace(/import .*getSettings.*\n/, "const getSettings = () => { throw new Error('must use snapshot'); };\n")
        .replace(/import .*normalizeChatCompletionsUrl.*\n/, "const normalizeChatCompletionsUrl = x => x;\n");
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (_, options) => {
        calls.push(options);
        return { ok: true, json: async () => ({ choices: [{ message: { content: "summary" } }] }) };
    };
    try {
        const settings = { independentApiConfig: { apiUrl: "https://example.invalid", apiKey: "snapshot", model: "model-a" } };
        const a = new AbortController(), b = new AbortController();
        await Promise.all([a, b].map(controller => module.runCustomSummaryProvider({ promptBundle: {}, maxTokens: 123 },
            { settings, signal: controller.signal })));
        a.abort();
        assert.equal(calls[1].signal.aborted, false);
        assert.equal(JSON.parse(calls[0].body).model, "model-a");
        assert.equal(JSON.parse(calls[0].body).max_tokens, 123);
        assert.equal(calls[0].headers.Authorization, "Bearer snapshot");
    } finally { globalThis.fetch = originalFetch; }
});
