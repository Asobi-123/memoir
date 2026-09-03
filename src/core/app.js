import { eventSource, event_types } from "/script.js";
import { initializeI18n } from "../i18n.js";
import { loadSettings } from "../state/settings-store.js";
import { buildAndMountPanel } from "../ui/panel.js";
import { mountSettingsUi, refreshInjectionCompatibility } from "../ui/settings-ui.js";
import { refreshInjectionDepthControl } from "../ui/injection-depth-control.js";
import { syncInjectionPrompt } from "../services/injection-service.js";
import { syncSegmentStaleState } from "../services/stale-detection-service.js";
import { refreshStatusPanel } from "../ui/status-panel.js";
import { refreshSegmentsPanel } from "../ui/segments-panel.js";
import { registerLauncher } from "../ui/launcher.js";
import { fillSuggestedDraftRange } from "../ui/draft-panel.js";
import { getChatMessages } from "./context.js";
import { debounce } from "../utils.js";

let initialized = false;
let hiddenMessageObserver = null;
let observedChatRoot = null;
let hiddenStateRefreshQueued = false;
let chatVisibilityMonitor = null;
let lastChatVisibilitySignature = "";

export async function initializeApp() {
    if (initialized) {
        return;
    }

    await initializeI18n();
    loadSettings();
    buildAndMountPanel();
    await registerLauncher();
    mountSettingsUi();
    registerEventHandlers();

    await syncInjectionPrompt();
    refreshStatusPanel();
    refreshSegmentsPanel();
    fillSuggestedDraftRange();

    initialized = true;
}

function registerEventHandlers() {
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
}
