import { getChatRange, getCurrentChatKey } from "../core/context.js";
import { getSettings } from "../state/settings-store.js";
import { buildPromptBundle } from "../prompts/prompt-registry.js";
import { runSummaryProvider } from "./provider-router.js";
import { hashMessageRange } from "./segment-hash-service.js";

const RECOVERY_MIN_RESPONSE_LENGTH = 600;

export async function generateDraftForRange({ startMes, endMes, settings: suppliedSettings, signal, automatic = false }) {
    const chatKey = getCurrentChatKey();
    const settings = structuredClone(suppliedSettings || getSettings());
    const messages = structuredClone(getChatRange(startMes, endMes));

    if (!messages.length) {
        throw new Error("No messages found in the selected range.");
    }

    const startFloor = Number(startMes) + 1;
    const endFloor = Number(endMes) + 1;
    const filterRules = Array.isArray(settings.summaryFilterFragments)
        ? settings.summaryFilterFragments.map((item) => String(item || "")).filter(Boolean)
        : [];
    const chatHistoryText = messages
        .map((message, index) => {
            const text = applySummaryFilters(message.mes || "", filterRules);
            return `#${startFloor + index} ${message.name || ""}\n${text}`.trim();
        })
        .join("\n\n");

    const range = { startFloor, endFloor };
    const promptBundle = buildPromptBundle(settings, range, chatHistoryText);
    const sourceHash = await hashMessageRange(messages);

    let providerRequest = buildProviderRequest({
        startMes,
        endMes,
        startFloor,
        endFloor,
        messages,
        sourceHash,
        promptBundle,
        maxTokens: getSummaryMaxTokens(settings),
    });
    let response;
    let emptyRetryUsed = false;
    let emptyRetryReason = "";
    let localFallbackUsed = false;
    let localFallbackReason = "";

    try {
        signal?.throwIfAborted();
        response = await runSummaryProvider(providerRequest, settings, { signal, automatic });
    } catch (error) {
        if (!shouldRetrySummaryFailure(error)) {
            throw error;
        }
        emptyRetryReason = error.message || "Provider failed before returning summary content.";
    }

    if (!hasUsableSummary(response)) {
        emptyRetryReason ||= "Provider returned empty summary content.";
    }

    if (emptyRetryReason && settings.summaryEmptyRetryEnabled !== false) {
        const recoveryPromptBundle = buildPromptBundle(settings, range, chatHistoryText, {
            forceContentCompatibilityPatch: true,
            emptyResponseRecovery: true,
        });
        providerRequest = buildProviderRequest({
            startMes,
            endMes,
            startFloor,
            endFloor,
            messages,
            sourceHash,
            promptBundle: recoveryPromptBundle,
            maxTokens: getRecoveryMaxTokens(settings),
        });
        emptyRetryUsed = true;

        try {
            signal?.throwIfAborted();
            response = await runSummaryProvider(providerRequest, settings, { signal, automatic });
        } catch (error) {
            if (!shouldRetrySummaryFailure(error)) {
                throw error;
            }
            localFallbackReason = error.message || "Reinforced retry failed before returning summary content.";
        }
    }

    if (!hasUsableSummary(response)) {
        localFallbackReason ||= emptyRetryUsed
            ? "Reinforced retry still returned empty summary content."
            : emptyRetryReason || "Provider returned empty summary content.";
        response = buildLocalFallbackResponse({
            startFloor,
            endFloor,
            messages,
            reason: localFallbackReason,
        });
        localFallbackUsed = true;
    }

    const archiveSummary = String(response.archiveSummary || "").trim();
    response = {
        ...response,
        archiveSummary,
        injectSummary: String(response.injectSummary || archiveSummary).trim(),
        emptyRetryUsed,
        emptyRetryReason,
        localFallbackUsed,
        localFallbackReason,
    };
    const resolvedMode = response.providerResolved || settings.summaryGenerationMode;
    const resolvedModel =
        resolvedMode === "independent-api"
            ? response.providerModel || settings.independentApiConfig.model || ""
            : response.providerModel || "";

    return {
        id: `draft_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
        chatKey,
        hashVersion: 2,
        range: { startMes, endMes, startFloor, endFloor },
        sourceHash,
        request: providerRequest,
        response,
        status: "draft",
        promptProfileId: settings.promptProfileId,
        stylePatchId: settings.stylePatchId,
        fanficPatchEnabled: settings.fanficPatchEnabled,
        contentCompatibilityPatchEnabled: settings.contentCompatibilityPatchEnabled,
        providerInfo: {
            requestedMode: settings.summaryGenerationMode,
            resolvedMode,
            fallbackUsed: !!response.providerFallbackUsed,
            fallbackReason: response.providerFallbackReason || "",
            emptyRetryUsed,
            emptyRetryReason,
            localFallbackUsed,
            localFallbackReason,
            model: resolvedModel,
        },
        createdAt: Date.now(),
    };
}

function buildProviderRequest({
    startMes,
    endMes,
    startFloor,
    endFloor,
    messages,
    sourceHash,
    promptBundle,
    maxTokens,
}) {
    return {
        startMes,
        endMes,
        startFloor,
        endFloor,
        messages,
        sourceHash,
        promptBundle,
        maxTokens,
    };
}

function getSummaryMaxTokens(settings) {
    return Number(settings.summaryResponseLength) > 0 ? Number(settings.summaryResponseLength) : 0;
}

function getRecoveryMaxTokens(settings) {
    const configured = getSummaryMaxTokens(settings);
    if (configured <= 0) {
        return 0;
    }
    return Math.max(configured, RECOVERY_MIN_RESPONSE_LENGTH);
}

function hasUsableSummary(response) {
    return !!String(response?.archiveSummary || "").trim();
}

function shouldRetrySummaryFailure(error) {
    const text = String(error?.message || error || "").toLowerCase();
    return /empty|content[_ -]?filter|filtered|moderation|safety|policy|blocked|refus/.test(text);
}

function buildLocalFallbackResponse({ startFloor, endFloor, messages, reason }) {
    const participants = [...new Set(
        messages
            .map((message) => String(message?.name || "").trim())
            .filter(Boolean),
    )].slice(0, 12);
    const participantText = participants.length ? participants.join("、") : "未识别";
    const archiveSummary = [
        "【主线剧情】",
        `第${startFloor}-${endFloor}楼的 API 总结返回为空，Memoir 已生成非空待修订草稿，避免本段总结流程中断。该区间涉及发言者：${participantText}。确认采用前，请人工补写本段真实剧情事实、关键对话、事件结果与后续影响。`,
        "",
        "【支线剧情】",
        "待人工确认。",
        "",
        "【状态变更】",
        "人物身份变化：待人工确认。",
        "人物关系变化：待人工确认。",
        "伤病/生理状态变化：待人工确认。",
        "位置变化：待人工确认。",
        "关键物品/资产/证据变化：待人工确认。",
        "承诺/交易/条件变化：待人工确认。",
        "",
        "【未解决事项】",
        `第${startFloor}-${endFloor}楼需要人工补全。原因：${reason}`,
    ].join("\n");

    return {
        rawText: archiveSummary,
        parseError: "API 返回空文本或内容过滤结果；已使用本地非空草稿兜底，确认前请人工修订。",
        parsed: null,
        archiveSummary,
        injectSummary: archiveSummary,
        providerModel: "",
        providerResolved: "local-fallback",
    };
}

function applySummaryFilters(text, rules) {
    let result = String(text || "");

    for (const rule of rules) {
        const parsedPair = parsePairedRule(rule);
        if (parsedPair) {
            result = removePairedBlocks(result, parsedPair.start, parsedPair.end);
            continue;
        }

        const fragment = String(rule || "").trim();
        if (!fragment) {
            continue;
        }

        const keywordPairRules = expandKeywordRule(fragment);
        if (keywordPairRules.length) {
            for (const pair of keywordPairRules) {
                result = removePairedBlocks(result, pair.start, pair.end);
            }
            continue;
        }

        result = result.split(fragment).join("");
    }
    return result.trim();
}

function parsePairedRule(rule) {
    const text = String(rule || "").trim();
    if (!text) {
        return null;
    }

    const separator = text.includes("=>") ? "=>" : text.includes(">>>") ? ">>>" : null;
    if (!separator) {
        return null;
    }

    const parts = text.split(separator).map((item) => item.trim()).filter(Boolean);
    if (parts.length !== 2) {
        return null;
    }

    return {
        start: parts[0],
        end: parts[1],
    };
}

function expandKeywordRule(rule) {
    const keyword = String(rule || "").trim().toLowerCase();
    if (!keyword) {
        return [];
    }

    if (keyword === "think") {
        return [
            { start: "<think>", end: "</think>" },
            { start: "<thinking>", end: "</thinking>" },
        ];
    }

    if (keyword === "comment" || keyword === "注释") {
        return [{ start: "<!--", end: "-->" }];
    }

    if (/^[a-z0-9_-]+$/i.test(keyword)) {
        return [{ start: `<${keyword}>`, end: `</${keyword}>` }];
    }

    return [];
}

function removePairedBlocks(text, startToken, endToken) {
    let result = String(text || "");
    if (!startToken || !endToken) {
        return result;
    }

    while (true) {
        const start = result.indexOf(startToken);
        if (start === -1) {
            break;
        }

        const end = result.indexOf(endToken, start + startToken.length);
        if (end === -1) {
            result = result.slice(0, start);
            break;
        }

        result = result.slice(0, start) + result.slice(end + endToken.length);
    }

    return result;
}
