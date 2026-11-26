import { getChatRange, getCurrentChatKey } from "../core/context.js";
import {
    clearApprovedRangeChanged,
    listApprovedRanges,
    markApprovedRangeChanged,
} from "../state/chat-segment-store.js";
import { hashMessageRange } from "./segment-hash-service.js";
import { saveMetadataDebounced } from "/scripts/extensions.js";

export async function syncSegmentStaleState() {
    const chatKey = getCurrentChatKey();
    const ranges = listApprovedRanges();

    for (const range of ranges) {
        const currentMessages = getChatRange(range.startMes, range.endMes);
        if (currentMessages.length !== range.endMes - range.startMes + 1) {
            markApprovedRangeChanged(range.id);
            continue;
        }

        const currentHash = await hashMessageRange(currentMessages, range.hashVersion || 1);
        if (getCurrentChatKey() !== chatKey) return;
        if (currentHash !== range.sourceHash) {
            markApprovedRangeChanged(range.id);
            continue;
        }

        if (range.changed) {
            clearApprovedRangeChanged(range.id);
        }
        if (!range.hashVersion) {
            const sourceHash = await hashMessageRange(currentMessages);
            if (getCurrentChatKey() !== chatKey) return;
            range.sourceHash = sourceHash;
            range.hashVersion = 2;
            saveMetadataDebounced();
        }
    }
}
