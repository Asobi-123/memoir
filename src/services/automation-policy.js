import { isMessageExcludedFromContext } from "./chat-visibility.js";

export function selectAutomaticRange(messages, ranges, config, ignoreSymbol) {
    if (ranges.some(r => r.changed || !r.sourceHash)) return { reason: "source-changed" };
    const { batchSize: size, keepRecent: keep } = config;
    if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(keep) || keep < 1) {
        return { reason: "invalid-config" };
    }
    const coverage = new Array(messages.length).fill(false);
    for (const range of ranges) {
        if (!Number.isInteger(range.startMes) || !Number.isInteger(range.endMes) ||
            range.startMes < 0 || range.endMes >= messages.length || range.startMes > range.endMes) {
            return { reason: "source-changed" };
        }
        coverage.fill(true, range.startMes, range.endMes + 1);
    }
    const startMes = coverage.indexOf(false);
    if (startMes < 0) return { reason: "waiting" };
    const endMes = startMes + size - 1;
    const coveredNext = coverage.indexOf(true, startMes);
    if (coveredNext >= 0 && coveredNext <= endMes) return { reason: "range-gap" };
    if (endMes >= messages.length - keep) return { reason: "waiting" };
    if (messages.slice(startMes, endMes + 1).some(m => isMessageExcludedFromContext(m, ignoreSymbol))) {
        return { reason: "hidden-source" };
    }
    return { range: { startMes, endMes, startFloor: startMes + 1, endFloor: endMes + 1 } };
}

export function isAutomaticResultUsable(draft) {
    const body = String(draft?.response?.archiveSummary || "").trim();
    return Boolean(body && !draft.response.parseError && !draft.providerInfo?.localFallbackUsed &&
        !draft.providerInfo?.fallbackUsed && !/^(?:i(?:'m| am) sorry|i cannot|i can't|抱歉|对不起|无法(?:提供|协助)|不能(?:提供|协助))/i.test(body));
}

export function automaticProviderReady(settings) {
    // generateRaw cannot isolate cancellation or temporary host parameters on the verified host.
    if (settings.summaryGenerationMode !== "independent-api") return "shared-api-unavailable";
    return settings.independentApiConfig?.apiUrl?.trim() && settings.independentApiConfig?.model?.trim()
        ? "" : "provider-incomplete";
}
