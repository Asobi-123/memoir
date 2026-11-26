import { saveMetadataDebounced } from "/scripts/extensions.js";
import { ensureChatStore, getCurrentChatKey, getChatMessages } from "../core/context.js";
import { ensureAutomation } from "./automation-store.js";

const runtimeDrafts = [];

export function listDrafts() {
    const key = getCurrentChatKey();
    const drafts = runtimeDrafts.filter(draft => draft.chatKey === key);
    const pending = ensureAutomation(ensureChatStore(), key).pending;
    if (pending && !drafts.some(d => d.id === pending.id)) drafts.push(pending);
    return drafts;
}

export function getDraft(draftId) {
    return listDrafts().find((draft) => draft.id === draftId) || null;
}

export function getLatestActiveDraft() {
    return listDrafts()
        .filter((draft) => draft.status === "draft")
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
}

export function saveDraftSegment(draft) {
    if (!draft.chatKey || draft.chatKey !== getCurrentChatKey()) throw new Error("chat-changed");
    const index = runtimeDrafts.findIndex((item) => item.id === draft.id);

    if (index === -1) {
        runtimeDrafts.push(draft);
    } else {
        runtimeDrafts[index] = draft;
    }

    return draft;
}

export function updateDraftStatus(draftId, status) {
    const draft = getDraft(draftId);
    if (!draft) {
        return null;
    }

    draft.status = status;
    draft.updatedAt = Date.now();
    const state = ensureAutomation(ensureChatStore(), getCurrentChatKey());
    if (state.pending?.id === draft.id) {
        state.pending = null;
        saveMetadataDebounced();
    }
    return draft;
}

export function clearInactiveDrafts() {
    for (let index = runtimeDrafts.length - 1; index >= 0; index--) {
        if (runtimeDrafts[index].status !== "draft") {
            runtimeDrafts.splice(index, 1);
        }
    }
}

export function getCumulativeSummary() {
    const store = ensureChatStore();
    store.cumulativeSummary ||= "";
    return store.cumulativeSummary;
}

export function getApprovedBaselineSummary() {
    const store = ensureChatStore();
    store.approvedBaselineSummary ||= "";
    return store.approvedBaselineSummary;
}

export function saveCumulativeSummary(text) {
    assertHistoryAvailable(text);
    const store = ensureChatStore();
    store.cumulativeSummary = String(text || "").trim();
    store.updatedAt = Date.now();
    saveMetadataDebounced();
    return store.cumulativeSummary;
}

export function resetCumulativeSummaryToBaseline() {
    const store = ensureChatStore();
    store.cumulativeSummary = store.approvedBaselineSummary || "";
    store.approvedRanges = structuredClone(store.approvedBaselineRanges || []);
    store.updatedAt = Date.now();
    saveMetadataDebounced();
    return store.cumulativeSummary;
}

export function clearAllApprovedSummaries() {
    assertHistoryAvailable("");
    const store = ensureChatStore();
    store.cumulativeSummary = "";
    store.approvedBaselineSummary = "";
    store.approvedRanges = [];
    store.approvedBaselineRanges = [];
    store.updatedAt = Date.now();
    saveMetadataDebounced();
}

function assertHistoryAvailable(nextText) {
    if (String(nextText || "").trim()) return;
    const messages = getChatMessages();
    if (listApprovedRanges().some(range => (range.taskId || range.sourceTaskIds?.length) &&
        messages.slice(range.startMes, range.endMes + 1).some(message => message.is_system))) {
        throw Object.assign(new Error("hidden-history"), { code: "hidden-history" });
    }
}

export function listApprovedRanges() {
    const store = ensureChatStore();
    store.approvedRanges ||= [];
    return store.approvedRanges;
}

export function overwriteApprovedRanges(ranges, { updateBaseline = false } = {}) {
    const store = ensureChatStore();
    store.approvedRanges = structuredClone(ranges || []);
    if (updateBaseline) {
        store.approvedBaselineRanges = structuredClone(store.approvedRanges);
    }
    store.updatedAt = Date.now();
    saveMetadataDebounced();
    return store.approvedRanges;
}

export function appendApprovedSummary(archiveSummary, rangeMeta) {
    const store = ensureChatStore();
    const block = String(archiveSummary || "").trim();
    if (!block) {
        return getCumulativeSummary();
    }

    const nextIndex = (store.approvedRanges?.length || 0) + 1;
    const title = `【第${nextIndex}次总结】(楼 ${Number(rangeMeta.startMes) + 1}-${Number(rangeMeta.endMes) + 1})`;
    const titledBlock = `${title}\n${block}`;
    const current = getCumulativeSummary();
    store.cumulativeSummary = current ? `${current}\n\n${titledBlock}` : titledBlock;
    store.approvedBaselineSummary = store.cumulativeSummary;
    store.approvedRanges ||= [];
    store.approvedRanges.push({
        id: `range_${Date.now()}`,
        index: nextIndex,
        title,
        startMes: rangeMeta.startMes,
        endMes: rangeMeta.endMes,
        sourceHash: rangeMeta.sourceHash,
        hashVersion: rangeMeta.hashVersion || 2,
        changed: false,
        approvedAt: Date.now(),
    });
    store.approvedBaselineRanges = structuredClone(store.approvedRanges);
    store.updatedAt = Date.now();
    saveMetadataDebounced();
    return store.cumulativeSummary;
}

export function markApprovedRangeChanged(rangeId) {
    const range = listApprovedRanges().find((item) => item.id === rangeId);
    if (!range) {
        return null;
    }

    range.changed = true;
    saveMetadataDebounced();
    return range;
}

export function clearApprovedRangeChanged(rangeId) {
    const range = listApprovedRanges().find((item) => item.id === rangeId);
    if (!range) {
        return null;
    }

    range.changed = false;
    saveMetadataDebounced();
    return range;
}
