import {
    setExtensionPrompt,
    extension_prompt_roles,
    extension_prompt_types,
    main_api,
} from "/script.js";
import { promptManager } from "/scripts/openai.js";
import { EXTENSION_PROMPT_KEY } from "../constants.js";
import { getSettings } from "../state/settings-store.js";
import { getCumulativeSummary } from "../state/chat-segment-store.js";
import { hasCharacterLayerAnchor } from "./injection-compatibility.js";
import { getAutomaticInjectionDepth } from "./range-state-service.js";

export async function syncInjectionPrompt() {
    const settings = getSettings();

    if (!settings.autoInjectApproved) {
        clearInjectionPrompt();
        return;
    }

    const position = settings.injectionPosition ?? extension_prompt_types.IN_PROMPT;
    if (position === extension_prompt_types.IN_PROMPT && !isCharacterLayerAvailable()) {
        clearInjectionPrompt();
        return;
    }

    let text = buildApprovedSummaryInjectionText(getCumulativeSummary(), settings);
    if (!text) {
        clearInjectionPrompt();
        return;
    }

    const depth = getEffectiveInjectionDepth(settings, position);
    if (depth === null) {
        clearInjectionPrompt();
        return;
    }
    const role = settings.injectionRole ?? extension_prompt_roles.SYSTEM;

    setExtensionPrompt(
        EXTENSION_PROMPT_KEY,
        text,
        position,
        depth,
        false,
        role,
    );
}

export function isCharacterLayerAvailable() {
    if (main_api !== "openai") {
        return true;
    }

    try {
        return hasCharacterLayerAnchor(main_api, promptManager?.getPromptCollection?.("normal"));
    } catch (_) {
        return false;
    }
}

export function getEffectiveInjectionDepth(settings, position) {
    if (position !== extension_prompt_types.IN_CHAT || settings.injectionDepthMode !== "auto") {
        return settings.injectionDepth ?? 1;
    }

    return getAutomaticInjectionDepth();
}

export function buildApprovedSummaryInjectionText(summaryText, settings = getSettings()) {
    let text = String(summaryText || "").trim();
    if (!text) {
        return "";
    }

    const tag = String(settings.injectionWrapTag || "").trim();
    if (tag) {
        text = `<${tag}>\n${text}\n</${tag}>`;
    }

    return text;
}

export function clearInjectionPrompt() {
    setExtensionPrompt(
        EXTENSION_PROMPT_KEY,
        "",
        extension_prompt_types.IN_PROMPT,
        1,
        false,
        extension_prompt_roles.SYSTEM,
    );
}
