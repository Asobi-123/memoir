export const AUTOMATION_DEFAULTS = Object.freeze({
    mode: "manual", batchSize: 20, keepRecent: 10, hideAfterApprove: false, paused: false,
});

export function ensureAutomation(store, chatKey) {
    const previous = store.automation;
    if (!previous || previous.ownerChatKey !== chatKey) {
        store.automation = { ...AUTOMATION_DEFAULTS, schemaVersion: 1, ownerChatKey: chatKey,
            pending: null, journal: null, reason: "", status: "idle" };
    }
    const state = store.automation;
    if (state.schemaVersion !== 1) return { ...AUTOMATION_DEFAULTS, paused: true,
        reason: "unsupported-state", status: "paused", ownerChatKey: chatKey };
    state.mode = ["manual", "draft", "auto-approve"].includes(state.mode) ? state.mode : "manual";
    state.batchSize = positiveInteger(state.batchSize, 20);
    state.keepRecent = positiveInteger(state.keepRecent, 10);
    state.hideAfterApprove = state.hideAfterApprove === true;
    state.paused = state.paused === true;
    return state;
}

function positiveInteger(value, fallback) {
    return Number.isSafeInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fallback;
}

export function summarySnapshot(store) {
    return structuredClone({ cumulativeSummary: store.cumulativeSummary || "",
        approvedRanges: store.approvedRanges || [], approvedBaselineSummary: store.approvedBaselineSummary || "",
        approvedBaselineRanges: store.approvedBaselineRanges || [] });
}

export function sameSummary(store, snapshot) {
    return JSON.stringify(summarySnapshot(store)) === JSON.stringify(snapshot);
}

export function compactDraft(draft) {
    return { id: draft.id, chatKey: draft.chatKey, origin: "automation", status: "draft",
        range: structuredClone(draft.range), sourceHash: draft.sourceHash, hashVersion: draft.hashVersion,
        visibilitySignature: draft.visibilitySignature,
        createdAt: draft.createdAt, response: { archiveSummary: String(draft.response?.archiveSummary || ""),
            parseError: draft.response?.parseError ? "needs-review" : "" },
        providerInfo: { requestedMode: draft.providerInfo?.requestedMode, resolvedMode: draft.providerInfo?.resolvedMode,
            model: draft.providerInfo?.model || "", localFallbackUsed: !!draft.providerInfo?.localFallbackUsed,
            fallbackUsed: !!draft.providerInfo?.fallbackUsed, emptyRetryUsed: !!draft.providerInfo?.emptyRetryUsed } };
}

export function appendSummaryToStore(store, draft, taskId = null) {
    if (taskId && store.approvedRanges?.some(r => r.taskId === taskId || r.sourceTaskIds?.includes(taskId))) return false;
    const index = (store.approvedRanges?.length || 0) + 1;
    const title = `【第${index}次总结】(楼 ${draft.range.startMes + 1}-${draft.range.endMes + 1})`;
    const block = `${title}\n${String(draft.response.archiveSummary).trim()}`;
    store.cumulativeSummary = [store.cumulativeSummary, block].filter(Boolean).join("\n\n");
    store.approvedRanges ||= [];
    store.approvedRanges.push({ id: taskId || draft.id, taskId, index, title,
        startMes: draft.range.startMes, endMes: draft.range.endMes, sourceHash: draft.sourceHash,
        hashVersion: draft.hashVersion || 2, changed: false, approvedAt: Date.now() });
    store.approvedBaselineSummary = store.cumulativeSummary;
    store.approvedBaselineRanges = structuredClone(store.approvedRanges);
    return true;
}
