import {
    appendApprovedSummary,
    clearInactiveDrafts,
    getDraft,
    getLatestActiveDraft,
    updateDraftStatus,
} from "../state/chat-segment-store.js";
import { getChatRange, getCurrentChatKey } from "../core/context.js";
import { hashMessageRange } from "./segment-hash-service.js";

export function getCurrentDraft() {
    return getLatestActiveDraft();
}

export async function approveDraft(draftId = null) {
    const draft = draftId ? getDraft(draftId) : getLatestActiveDraft();
    if (!draft) {
        throw new Error("No active draft found.");
    }

    if (draft.status !== "draft") {
        throw new Error("Draft is not in approvable state.");
    }

    const key = getCurrentChatKey();
    const messages = getChatRange(draft.range.startMes, draft.range.endMes);
    if (draft.chatKey !== key || messages.length !== draft.range.endMes - draft.range.startMes + 1 ||
        await hashMessageRange(messages, draft.hashVersion || 1) !== draft.sourceHash || getCurrentChatKey() !== key) {
        throw new Error("source-changed");
    }

    const cumulativeSummary = appendApprovedSummary(draft.response.archiveSummary, {
        startMes: draft.range.startMes,
        endMes: draft.range.endMes,
        sourceHash: draft.sourceHash,
        hashVersion: draft.hashVersion,
    });
    updateDraftStatus(draft.id, "approved");
    clearInactiveDrafts();
    return {
        range: draft.range,
        cumulativeSummary,
        approvedAt: Date.now(),
    };
}

export function rejectDraft(draftId = null) {
    const draft = draftId ? getDraft(draftId) : getLatestActiveDraft();
    if (!draft) {
        throw new Error("No active draft found.");
    }

    updateDraftStatus(draft.id, "rejected");
    clearInactiveDrafts();
    return draft;
}
