import { getContext } from "/scripts/extensions.js";
import { EXTENSION_ID, CHAT_STORE_VERSION } from "../constants.js";
import { getChatIdentity } from "../services/automation-host-adapter.js";

export function getSafeContext() {
    return getContext();
}

export function getChatMessages() {
    const context = getSafeContext();
    return Array.isArray(context.chat) ? context.chat : [];
}

export function getCurrentChatId() {
    const context = getSafeContext();
    return context.chatId || context.getCurrentChatId?.() || "";
}

export function getCurrentChatKey() {
    return getChatIdentity(getSafeContext())?.key || "";
}

export function ensureChatStore() {
    const context = getSafeContext();
    const metadata = context.chatMetadata || {};

    metadata.extensions ||= {};
    metadata.extensions[EXTENSION_ID] ||= {
        version: CHAT_STORE_VERSION,
        approvedRanges: [],
        approvedBaselineRanges: [],
        cumulativeSummary: "",
        approvedBaselineSummary: "",
    };

    // Clean up legacy persisted fields from older prototypes.
    delete metadata.extensions[EXTENSION_ID].segments;
    delete metadata.extensions[EXTENSION_ID].drafts;

    return metadata.extensions[EXTENSION_ID];
}

export function getChatRange(startMes, endMes) {
    const messages = getChatMessages();
    const startIndex = Math.max(0, Number(startMes) || 0);
    const endIndex = Math.min(messages.length - 1, Number(endMes) || 0);
    if (startIndex > endIndex || messages.length === 0) {
        return [];
    }
    return messages.slice(startIndex, endIndex + 1);
}
