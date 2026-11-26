import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hashMessageRange } from "../src/services/segment-hash-service.js";
import { appendSummaryToStore } from "../src/state/automation-store.js";

// Exercise the production service with only its host/provider boundaries substituted.
const source = (await readFile(new URL("../src/services/fusion-service.js", import.meta.url), "utf8"))
    .replace(/import[\s\S]*?from "[^"]+";\n/g, "");
const storeSource = (await readFile(new URL("../src/state/chat-segment-store.js", import.meta.url), "utf8"))
    .replace(/import[^\n]*\n/g, "");
let sequence = 0;
async function fixture(bounds = [[0, 19], [20, 39], [40, 59]]) {
    const f = { messages: Array.from({ length: 70 }, (_, i) => ({ mes: `fact ${i}`, is_system: true })),
        key: "chat-a", calls: 0, writes: 0, text: "", ranges: [] };
    for (const [i, [startMes, endMes]] of bounds.entries()) {
        const title = `【第${i + 1}次总结】(楼 ${startMes + 1}-${endMes + 1})`;
        f.text += (i ? "\n\n" : "") + title + `\nEdited summary ${i}`;
        f.ranges.push({ id: `r${i}`, taskId: `task${i}`, title, startMes, endMes,
            sourceHash: await hashMessageRange(f.messages.slice(startMes, endMes + 1)), hashVersion: 2, changed: false });
    }
    globalThis.__fusionFixture = f;
    f.hash = hashMessageRange;
    const prelude = `const f=globalThis.__fusionFixture; const fixtureId=${++sequence};
const getSettings=()=>({summaryEmptyRetryEnabled:false});
const DEFAULT_SETTINGS={fusionSystemPrompt:'fixture',fusionUserTemplate:'{{selected_blocks}}'};
const getCurrentChatKey=()=>f.key;
const getChatRange=(a,b)=>f.messages.slice(a,b+1);
const hashMessageRange=(...args)=>f.hash(...args);
const getCumulativeSummary=()=>f.text;
const listApprovedRanges=()=>f.ranges;
const saveCumulativeSummary=t=>{f.text=t;f.writes++};
const overwriteApprovedRanges=r=>{f.ranges=r;f.writes++};
const runSummaryProvider=async()=>{f.calls++;await f.duringProvider?.();return {archiveSummary:'Fused fixture'}};
const EMPTY_RESPONSE_RECOVERY_PATCH_TEXT='';const getContentCompatibilityPatchText=()=>'';\n`;
    f.service = await import(`data:text/javascript;base64,${Buffer.from(prelude + source).toString("base64")}`);
    const storePrelude = `const f=globalThis.__fusionFixture;const fixtureId=${sequence};
const saveMetadataDebounced=()=>{};const ensureChatStore=()=>f.store;
const getCurrentChatKey=()=>f.key;const getChatMessages=()=>f.messages;const ensureAutomation=()=>({});\n`;
    f.storeApi = await import(`data:text/javascript;base64,${Buffer.from(storePrelude + storeSource).toString("base64")}`);
    return f;
}

test("fusion rejects coverage gaps without calling provider or writing", async () => {
    const f = await fixture([[0, 19], [40, 59]]);
    await assert.rejects(f.service.runFusionCompression(), /fusion-range-gap/);
    assert.equal(f.calls, 0); assert.equal(f.writes, 0);
});

test("fusion retains provenance through repeat fusion and prevents clearing hidden history", async () => {
    const f = await fixture();
    const untouched = structuredClone(f.ranges[2]);
    await f.service.runFusionCompression({ startIndex: 1, endIndex: 2 });
    assert.deepEqual(f.ranges[0].sourceTaskIds, ["task0", "task1"]);
    assert.equal(f.ranges[0].endMes, 39);
    assert.equal(f.ranges[1].sourceHash, untouched.sourceHash);
    assert.equal(f.ranges[1].taskId, untouched.taskId);
    await f.service.runFusionCompression();
    assert.deepEqual(f.ranges[0].sourceTaskIds, ["task0", "task1", "task2"]);
    assert.equal(f.ranges[0].sourceHash, await hashMessageRange(f.messages.slice(0, 60)));
    f.store = { cumulativeSummary: f.text, approvedRanges: f.ranges };
    const before = structuredClone(f.store);
    assert.throws(() => f.storeApi.clearAllApprovedSummaries(), /hidden-history/);
    assert.throws(() => f.storeApi.saveCumulativeSummary(""), /hidden-history/);
    assert.deepEqual(f.store, before);
    assert.equal(appendSummaryToStore(f.store, {}, "task0"), false);
    f.messages.forEach(m => { m.is_system = false; });
    f.storeApi.clearAllApprovedSummaries();
    assert.equal(f.store.cumulativeSummary, "");
});

test("invalid selection and edited headings fail before provider call", async () => {
    for (const mode of ["out-of-range", "missing-header", "mismatched-floor"]) {
        const f = await fixture();
        if (mode === "missing-header") f.text = "Manual preface\n" + f.text;
        if (mode === "mismatched-floor") f.text = f.text.replace("1-20", "1-21");
        await assert.rejects(f.service.runFusionCompression(mode === "out-of-range" ? { startIndex: 9 } : {}), /fusion-invalid-range/);
        assert.equal(f.calls, 0); assert.equal(f.writes, 0);
    }
});

test("fusion cannot re-baseline stale or unverifiable approved sources", async () => {
    for (const mode of ["edited-source", "changed-flag", "missing-hash", "legacy-hash"]) {
        const f = await fixture();
        if (mode === "edited-source") f.messages[0].mes = "new fact";
        if (mode === "changed-flag") f.ranges[0].changed = true;
        if (mode === "missing-hash") f.ranges[0].sourceHash = "";
        if (mode === "legacy-hash") {
            f.ranges.forEach(r => { delete r.hashVersion; });
            for (const r of f.ranges) r.sourceHash = await hashMessageRange(f.messages.slice(r.startMes, r.endMes + 1), 1);
        }
        if (mode === "legacy-hash") {
            await f.service.runFusionCompression(); assert.equal(f.ranges[0].hashVersion, 2);
        } else {
            await assert.rejects(f.service.runFusionCompression(), /source-changed/);
            assert.equal(f.calls, 0); assert.equal(f.writes, 0);
        }
    }
});

test("fusion discards response if chat, summary, ranges or source change during request", async () => {
    for (const mutate of [f => { f.key = "chat-b"; }, f => { f.text += "\nHuman edit"; },
        f => { f.ranges[0].changed = true; }, f => { f.messages[0].mes = "edited during request"; }]) {
        const f = await fixture(); f.duringProvider = () => mutate(f);
        await assert.rejects(f.service.runFusionCompression(), /chat-changed|summary-changed|source-changed/);
        assert.equal(f.calls, 1); assert.equal(f.writes, 0);
    }
});

test("fusion catches source edits while asynchronous hashing is pending", async () => {
    const f = await fixture(); let once = true;
    f.hash = async (...args) => {
        const hash = await hashMessageRange(...args);
        if (once) { once = false; f.messages[0].mes = "racing edit"; }
        return hash;
    };
    await assert.rejects(f.service.runFusionCompression(), /source-changed/);
    assert.equal(f.calls, 0); assert.equal(f.writes, 0);
});
