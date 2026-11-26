import { eventSource, event_types } from "/script.js";
import * as hostCore from "/script.js";
import * as hostChats from "/scripts/chats.js";
import { initializeI18n } from "../i18n.js";
import { loadSettings, getSettings } from "../state/settings-store.js";
import { buildAndMountPanel } from "../ui/panel.js";
import { mountSettingsUi, refreshInjectionCompatibility } from "../ui/settings-ui.js";
import { refreshInjectionDepthControl } from "../ui/injection-depth-control.js";
import { syncInjectionPrompt, getInjectionReadiness } from "../services/injection-service.js";
import { syncSegmentStaleState } from "../services/stale-detection-service.js";
import { refreshStatusPanel } from "../ui/status-panel.js";
import { refreshSegmentsPanel } from "../ui/segments-panel.js";
import { registerLauncher } from "../ui/launcher.js";
import { fillSuggestedDraftRange } from "../ui/draft-panel.js";
import { getChatMessages, getSafeContext, ensureChatStore } from "./context.js";
import { debounce } from "../utils.js";
import { createAutomationHost } from "../services/automation-host-adapter.js";
import { createAutomationService, createAutomationActions, setAutomationRuntime } from "../services/automation-service.js";
import { generateDraftForRange } from "../services/summary-draft-service.js";
import { getCurrentDraft } from "../services/approval-service.js";
import { hasUnsavedSummaryEdits } from "../ui/segments-panel.js";
import { mountAutomationUi, refreshAutomationUi } from "../ui/automation-ui.js";

let initialized = false;
let hiddenMessageObserver = null;
let observedChatRoot = null;
let hiddenStateRefreshQueued = false;
let chatVisibilityMonitor = null;
let lastChatVisibilitySignature = "";
let automation = null;

export async function initializeApp() {
    if (initialized) {
        return;
    }

    await initializeI18n();
    loadSettings();
    buildAndMountPanel();
    await registerLauncher();
    await mountSettingsUi();
    const host = createAutomationHost({ getContext: getSafeContext, isGenerating: hostCore.isGenerating,
        hideRange: hostChats.hideChatMessageRange });
    const actions = createAutomationActions({ host, getStore: ensureChatStore, getSettings,
        generate: generateDraftForRange, syncInjection: syncInjectionPrompt,
        canInject: getInjectionReadiness, isEditing: hasUnsavedSummaryEdits });
    automation = createAutomationService({ host, getStore: ensureChatStore, getSettings,
        hasDraft: getCurrentDraft, isEditing: hasUnsavedSummaryEdits, onChange: refreshAutomationUi,
        processRange: actions.processRange, actions, ignoreSymbol: Symbol.for("ignore") });
    setAutomationRuntime(automation);
    mountAutomationUi(automation);
    registerEventHandlers();

    await syncInjectionPrompt();
    refreshStatusPanel();
    refreshSegmentsPanel();
    fillSuggestedDraftRange();

    initialized = true;
}

function registerEventHandlers() {
    eventSource.on(event_types.CHAT_CHANGED, () => { automation.chatChanged(); refreshAutomationUi(true); });
    for (const type of [event_types.MESSAGE_SENT, event_types.MESSAGE_UPDATED, event_types.MESSAGE_DELETED,
        event_types.MESSAGE_SWIPED, event_types.GENERATION_STOPPED]) {
        eventSource.on(type, () => automation.cancel());
    }
    eventSource.on(event_types.GENERATION_STARTED, (_type, _options, dryRun) => { if (!dryRun) automation.cancel(); });
    eventSource.on(event_types.MESSAGE_RECEIVED, (index, type) => {
        const message = getChatMessages()[index];
        if (["normal", "continue", "swipe", "regenerate"].includes(type) && message &&
            !message.is_user && !message.is_system && String(message.mes || "").trim()) {
            automation.schedule(`${automation.host.identity()?.key}:${index}:${message.swipe_id ?? 0}:${message.mes}`);
        }
    });
    globalThis.addEventListener("pagehide", () => automation.dispose());
    const debouncedChatChanged = debounce(handleChatChanged, 300);
    eventSource.on(event_types.CHAT_CHANGED, debouncedChatChanged);
    eventSource.on(event_types.MESSAGE_DELETED, debouncedChatChanged);
    eventSource.on(event_types.MESSAGE_UPDATED, debouncedChatChanged);
    eventSource.on(event_types.MESSAGE_SWIPED, debouncedChatChanged);
    eventSource.on(event_types.MESSAGE_SENT, handleChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, handleChatChanged);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, handleOpenAiPresetChanged);
    registerHiddenMessageObserver();
    registerChatVisibilityMonitor();
}

function registerHiddenMessageObserver() {
    if (!globalThis.MutationObserver) {
        return;
    }

    const observeChat = () => {
        const chatRoot = document.getElementById("chat");
        if (!chatRoot || chatRoot === observedChatRoot) {
            return;
        }

        hiddenMessageObserver?.disconnect();
        observedChatRoot = chatRoot;
        hiddenMessageObserver = new globalThis.MutationObserver((records) => {
            const hiddenStateChanged = records.some((record) =>
                record.oldValue === "true" || record.target.getAttribute("is_system") === "true",
            );
            if (hiddenStateChanged) {
                scheduleHiddenStateRefresh();
            }
        });
        hiddenMessageObserver.observe(chatRoot, {
            attributes: true,
            attributeFilter: ["is_system"],
            attributeOldValue: true,
            subtree: true,
        });
    };

    observeChat();
    eventSource.on(event_types.CHAT_CHANGED, () => queueMicrotask(observeChat));
}

function scheduleHiddenStateRefresh() {
    if (hiddenStateRefreshQueued) {
        return;
    }

    hiddenStateRefreshQueued = true;
    queueMicrotask(async () => {
        hiddenStateRefreshQueued = false;
        await handleChatChanged();
    });
}

function getChatVisibilitySignature() {
    return getChatMessages()
        .map((message) => message?.is_system === true ? "1" : "0")
        .join("");
}

function registerChatVisibilityMonitor() {
    lastChatVisibilitySignature = getChatVisibilitySignature();
    chatVisibilityMonitor ??= setInterval(() => {
        const currentSignature = getChatVisibilitySignature();
        if (currentSignature === lastChatVisibilitySignature) {
            return;
        }

        lastChatVisibilitySignature = currentSignature;
        scheduleHiddenStateRefresh();
    }, 200);
}

async function handleOpenAiPresetChanged() {
    refreshInjectionCompatibility();
    refreshInjectionDepthControl();
    await syncInjectionPrompt();
}

async function handleChatChanged() {
    lastChatVisibilitySignature = getChatVisibilitySignature();
    try { await syncSegmentStaleState(); } catch (_) {}
    try { await syncInjectionPrompt(); } catch (_) {}
    refreshInjectionDepthControl();
    refreshStatusPanel();
    refreshSegmentsPanel();
    fillSuggestedDraftRange();
    refreshAutomationUi();
}
