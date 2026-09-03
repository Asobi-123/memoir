import { IGNORE_SYMBOL } from "/scripts/constants.js";
import { getChatMessages } from "../core/context.js";
import { listApprovedRanges } from "../state/chat-segment-store.js";
import { isMessageExcludedFromContext } from "./chat-visibility.js";
import { calculateAutomaticInjectionDepth } from "./injection-depth-calculator.js";

function normalizeRange(startMes, endMes) {
    const start = Number(startMes);
    const end = Number(endMes);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        return null;
    }

    return { start, end };
}

function buildBooleanMask(length, ranges) {
    const mask = new Array(length).fill(false);
    for (const range of ranges) {
        const safe = normalizeRange(range.start, range.end);
        if (!safe) {
            continue;
        }

        const boundedStart = Math.max(0, safe.start);
        const boundedEnd = Math.min(length - 1, safe.end);
        for (let index = boundedStart; index <= boundedEnd; index++) {
            mask[index] = true;
        }
    }
    return mask;
}

function maskToRanges(mask) {
    const ranges = [];
    let start = -1;

    for (let index = 0; index < mask.length; index++) {
        if (mask[index] && start === -1) {
            start = index;
            continue;
        }

        if (!mask[index] && start !== -1) {
            ranges.push({ start, end: index - 1 });
            start = -1;
        }
    }

    if (start !== -1) {
        ranges.push({ start, end: mask.length - 1 });
    }

    return ranges;
}

export function formatRanges(ranges) {
    if (!ranges.length) {
        return "(none)";
    }

    return ranges
        .map((range) =>
            range.start === range.end
                ? `${range.start + 1}`
                : `${range.start + 1}-${range.end + 1}`,
        )
        .join(", ");
}

export function getSummarizedRanges() {
    return listApprovedRanges()
        .map((range) => ({ start: range.startMes, end: range.endMes }))
        .filter(Boolean);
}

export function getChangedRanges() {
    return listApprovedRanges()
        .filter((range) => range.changed)
        .map((range) => ({ start: range.startMes, end: range.endMes }))
        .filter(Boolean);
}

export function getHiddenRanges() {
    const messages = getChatMessages();
    const mask = messages.map(isHiddenFromPrompt);
    return maskToRanges(mask);
}

export function getAutomaticInjectionDepth(messages = getChatMessages(), approvedRanges = listApprovedRanges()) {
    return calculateAutomaticInjectionDepth(messages.map(isHiddenFromPrompt), approvedRanges);
}

function isHiddenFromPrompt(message) {
    return isMessageExcludedFromContext(message, IGNORE_SYMBOL);
}

export function getPendingRanges() {
    const messages = getChatMessages();
    const summarizedMask = buildBooleanMask(messages.length, getSummarizedRanges());
    const pendingMask = summarizedMask.map((value) => !value);
    return maskToRanges(pendingMask);
}
