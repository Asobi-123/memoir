import { getSettings } from "../state/settings-store.js";
import { DEFAULT_SETTINGS } from "../state/defaults.js";
import { getChatRange, getCurrentChatKey } from "../core/context.js";
import { hashMessageRange } from "./segment-hash-service.js";
import {
    getCumulativeSummary,
    overwriteApprovedRanges,
    saveCumulativeSummary,
} from "../state/chat-segment-store.js";
import { runSummaryProvider } from "./provider-router.js";
import {
    EMPTY_RESPONSE_RECOVERY_PATCH_TEXT,
    getContentCompatibilityPatchText,
} from "../prompts/prompt-registry.js";

const RECOVERY_MIN_RESPONSE_LENGTH = 800;

export async function runFusionCompression({ startIndex = null, endIndex = null } = {}) {
    const chatKey = getCurrentChatKey();
    const current = getCumulativeSummary().trim();
    if (!current) {
        throw new Error("当前没有可融合压缩的累计总结正文。");
    }

    const blocks = splitSummaryBlocks(current);
    if (!blocks.length) {
        throw new Error("当前累计总结正文里没有可识别的总结块。");
    }

    const start = normalizeIndex(startIndex, 1);
    const end = normalizeIndex(endIndex, blocks.length);

    if (start > end) {
        throw new Error("融合范围无效：起始总结序号不能大于结束总结序号。");
    }

    const targetBlocks = blocks.slice(start - 1, end);
    const before = blocks.slice(0, start - 1);
    const after = blocks.slice(end);

    const settings = getSettings();
    const baseSystemPrompt = settings.fusionSystemPrompt || DEFAULT_SETTINGS.fusionSystemPrompt;
    const userPrompt = (settings.fusionUserTemplate || DEFAULT_SETTINGS.fusionUserTemplate).replaceAll(
        "{{selected_blocks}}",
        targetBlocks.map((block) => block.fullText).join("\n\n"),
    );
    let emptyRetryUsed = false;
    let localFallbackUsed = false;
    let fallbackReason = "";

    let providerRequest = buildFusionProviderRequest({
        settings,
        systemPrompt: buildFusionSystemPrompt(settings, baseSystemPrompt),
        userPrompt,
        maxTokens: getFusionMaxTokens(settings),
    });
    let response;

    try {
        response = await runSummaryProvider(providerRequest, settings);
    } catch (error) {
        if (!shouldRetryFusionFailure(error)) {
            throw error;
        }
        fallbackReason = error.message || "Provider failed before returning fusion content.";
    }

    if (!hasUsableFusion(response)) {
        fallbackReason ||= "Provider returned empty fusion content.";
    }

    if (fallbackReason && settings.summaryEmptyRetryEnabled !== false) {
        emptyRetryUsed = true;
        providerRequest = buildFusionProviderRequest({
            settings,
            systemPrompt: buildFusionSystemPrompt(settings, baseSystemPrompt, {
                forceContentCompatibilityPatch: true,
                emptyResponseRecovery: true,
            }),
            userPrompt,
            maxTokens: getRecoveryMaxTokens(settings),
        });

        try {
            response = await runSummaryProvider(providerRequest, settings);
        } catch (error) {
            if (!shouldRetryFusionFailure(error)) {
                throw error;
            }
            fallbackReason = error.message || "Reinforced fusion retry failed before returning content.";
        }
    }

    let finalBody = String(response?.archiveSummary || "").trim();
    if (!finalBody) {
        localFallbackUsed = true;
        fallbackReason ||= emptyRetryUsed
            ? "Reinforced fusion retry still returned empty content."
            : "Provider returned empty fusion content.";
        finalBody = buildLocalFusionFallbackBody(targetBlocks, fallbackReason);
    }

    const mergedRange = {
        startFloor: Math.min(...targetBlocks.map((block) => block.startFloor ?? Number.MAX_SAFE_INTEGER)),
        endFloor: Math.max(...targetBlocks.map((block) => block.endFloor ?? 0)),
    };

    const rebuilt = [
        ...before,
        {
            fullText: "",
            startFloor: mergedRange.startFloor,
            endFloor: mergedRange.endFloor,
            body: finalBody,
        },
        ...after,
    ];

    const renumbered = rebuilt.map((block, index) => buildNumberedBlock(index + 1, block.startFloor, block.endFloor, block.body));
    const finalText = renumbered.join("\n\n").trim();
    const rebuiltRanges = rebuilt.map((block, index) => ({
        id: `range_rebuilt_${Date.now()}_${index}`,
        index: index + 1,
        title: `【第${index + 1}次总结】(楼 ${block.startFloor}-${block.endFloor})`,
        startMes: Math.max(0, (block.startFloor || 1) - 1),
        endMes: Math.max(0, (block.endFloor || 1) - 1),
        sourceHash: "",
        changed: false,
        approvedAt: Date.now(),
    }));

    for (const range of rebuiltRanges) {
        if (chatKey !== getCurrentChatKey()) throw new Error("chat-changed");
        range.sourceHash = await hashMessageRange(getChatRange(range.startMes, range.endMes));
        range.hashVersion = 2;
    }
    if (chatKey !== getCurrentChatKey() || current !== getCumulativeSummary().trim()) throw new Error("summary-changed");
    saveCumulativeSummary(finalText);
    overwriteApprovedRanges(rebuiltRanges, { updateBaseline: false });
    return {
        finalText,
        emptyRetryUsed,
        localFallbackUsed,
        fallbackReason,
    };
}

function buildFusionProviderRequest({ systemPrompt, userPrompt, maxTokens }) {
    return {
        promptBundle: { systemPrompt, userPrompt },
        maxTokens,
    };
}

function buildFusionSystemPrompt(settings, baseSystemPrompt, options = {}) {
    const systemParts = [baseSystemPrompt];

    if (settings.contentCompatibilityPatchEnabled || options.forceContentCompatibilityPatch) {
        systemParts.push(getContentCompatibilityPatchText(settings));
    }

    if (options.emptyResponseRecovery) {
        systemParts.push(EMPTY_RESPONSE_RECOVERY_PATCH_TEXT);
    }

    return systemParts.join("\n\n");
}

function getFusionMaxTokens(settings) {
    return Number(settings.fusionResponseLength) > 0 ? Number(settings.fusionResponseLength) : 0;
}

function getRecoveryMaxTokens(settings) {
    const configured = getFusionMaxTokens(settings);
    if (configured <= 0) {
        return 0;
    }
    return Math.max(configured, RECOVERY_MIN_RESPONSE_LENGTH);
}

function hasUsableFusion(response) {
    return !!String(response?.archiveSummary || "").trim();
}

function shouldRetryFusionFailure(error) {
    const text = String(error?.message || error || "").toLowerCase();
    return /empty|content[_ -]?filter|filtered|moderation|safety|policy|blocked|refus/.test(text);
}

function buildLocalFusionFallbackBody(targetBlocks, reason) {
    const sourceText = targetBlocks
        .map((block) => block.fullText)
        .join("\n\n")
        .trim()
        .split("\n")
        .map((line) => (line.match(/^【(?:第\d+次总结|融合总结)】/) ? `原${line}` : line))
        .join("\n");
    return [
        "【融合压缩待人工修订】",
        "API 融合压缩返回为空或被过滤。Memoir 已保留原选中总结正文，避免融合流程丢失内容。",
        `原因：${reason}`,
        "",
        "请人工压缩以下原总结内容后再保存：",
        "",
        sourceText,
    ].join("\n").trim();
}

function splitSummaryBlocks(text) {
    const lines = String(text || "").trim().split("\n");
    const blocks = [];
    let current = null;

    for (const rawLine of lines) {
        const line = rawLine ?? "";
        const match = line.match(/^【(?:第(\d+)次总结|融合总结)】\(楼\s*(\d+)-(\d+)(?:[^)]*)\)$/);
        if (match) {
            if (current) {
                current.fullText = [current.title, current.body].filter(Boolean).join("\n").trim();
                blocks.push(current);
            }
            current = {
                title: line.trim(),
                startFloor: Number(match[2]),
                endFloor: Number(match[3]),
                body: "",
                fullText: "",
            };
            continue;
        }

        if (!current) {
            current = {
                title: "",
                startFloor: 1,
                endFloor: 1,
                body: line,
                fullText: "",
            };
        } else {
            current.body = current.body ? `${current.body}\n${line}` : line;
        }
    }

    if (current) {
        current.fullText = [current.title, current.body].filter(Boolean).join("\n").trim();
        blocks.push(current);
    }

    return blocks.filter((block) => block.fullText.trim());
}

function buildNumberedBlock(index, startFloor, endFloor, body) {
    return `【第${index}次总结】(楼 ${startFloor}-${endFloor})\n${String(body || "").trim()}`.trim();
}

function normalizeIndex(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }
    return Math.floor(numeric);
}
