function normalizeRange(startMes, endMes) {
    const start = Number(startMes);
    const end = Number(endMes);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        return null;
    }

    return { start, end };
}

function buildCoverageMask(length, approvedRanges) {
    const coverage = new Array(length).fill(false);
    for (const range of approvedRanges) {
        const normalized = normalizeRange(range?.startMes, range?.endMes);
        if (!normalized) {
            continue;
        }

        const start = Math.max(0, normalized.start);
        const end = Math.min(length - 1, normalized.end);
        for (let index = start; index <= end; index++) {
            coverage[index] = true;
        }
    }
    return coverage;
}

/**
 * Returns the chat-layer depth immediately after a proven hidden summary prefix.
 * A null result means the summary boundary cannot be inferred safely.
 */
export function calculateAutomaticInjectionDepth(hiddenMask, approvedRanges) {
    if (!Array.isArray(hiddenMask) || hiddenMask.length === 0) {
        return null;
    }

    const firstVisibleIndex = hiddenMask.findIndex((hidden) => !hidden);
    const hiddenEnd = firstVisibleIndex === -1 ? hiddenMask.length - 1 : firstVisibleIndex - 1;

    if (hiddenEnd < 0 || hiddenMask.slice(hiddenEnd + 1).some(Boolean)) {
        return null;
    }

    const coverage = buildCoverageMask(hiddenMask.length, approvedRanges || []);
    const summaryEnd = (approvedRanges || []).reduce((maxEnd, range) => {
        const normalized = normalizeRange(range?.startMes, range?.endMes);
        return normalized ? Math.max(maxEnd, normalized.end) : maxEnd;
    }, -1);

    if (summaryEnd !== hiddenEnd || coverage.slice(0, hiddenEnd + 1).some((covered) => !covered)) {
        return null;
    }

    return hiddenMask.length - hiddenEnd - 1;
}
