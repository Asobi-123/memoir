import { SETTINGS_MOUNT_SELECTOR } from "../constants.js";
import { t } from "../i18n.js";
import { normalizeNonNegativeInteger, notify } from "../utils.js";
import {
    applyApiProfile,
    deleteCurrentApiProfile,
    getSettings,
    listApiProfiles,
    saveActiveApiProfile,
    saveCurrentApiProfile,
    updateIndependentApiConfig,
    updateSettings,
} from "../state/settings-store.js";
import {
    deleteCustomPromptProfile,
    getPromptProfileById,
    getPromptProfileOptions,
    getAllStylePatchOptions,
    getStylePatchText,
    getFanficPatchText,
    getContentCompatibilityPatchText,
    normalizeContentCompatibilityPatchText,
    upsertCustomStylePatch,
    deleteCustomStylePatch,
    STYLE_PATCH_TEXT,
    FANFIC_PATCH_TEXT,
    CONTENT_COMPATIBILITY_PATCH_TEXT,
    upsertCustomPromptProfile,
} from "../prompts/prompt-registry.js";
import { DEFAULT_SETTINGS } from "../state/defaults.js";
import { refreshStatusPanel } from "./status-panel.js";
import { refreshSegmentsPanel } from "./segments-panel.js";
import { bindDraftPanel, fillSuggestedDraftRange } from "./draft-panel.js";
import { isCharacterLayerAvailable, syncInjectionPrompt } from "../services/injection-service.js";
import { refreshInjectionDepthControl } from "./injection-depth-control.js";
import { openPanel, setTriggerVisible } from "./panel.js";

let mounted = false;
const promptEditorState = {
    loadedProfileId: "",
    loadedBuiltIn: false,
    baselineSystemPrompt: "",
    baselineUserTemplate: "",
    dirty: false,
};

/**
 * Load sidebar HTML, populate form fields and bind events.
 */
export async function mountSettingsUi() {
    if (mounted) {
        fillForm();
        return;
    }

    await loadSidebarHtml();
    bindSidebarEvents();
    populatePromptOptions();
    populateApiProfileOptions();
    fillForm();
    bindSettingsEvents();
    bindDraftPanel();

    mounted = true;
}

function populatePromptOptions() {
    const promptSelect = document.getElementById("cc-prompt-profile");
    const styleSelect = document.getElementById("cc-style-patch");

    if (promptSelect) {
        const options = getPromptProfileOptions();
        const builtIn = options.filter((item) => item.builtIn);
        const custom = options.filter((item) => !item.builtIn);

        const groups = [];
        groups.push(
            `<optgroup label="${t("settings.builtInPresets")}">${builtIn
                .map((item) => `<option value="${item.id}">${item.label}</option>`)
                .join("")}</optgroup>`,
        );

        if (custom.length) {
            groups.push(
                `<optgroup label="${t("settings.customPresets")}">${custom
                    .map((item) => `<option value="${item.id}">${item.label}</option>`)
                    .join("")}</optgroup>`,
            );
        }

        promptSelect.innerHTML = groups.join("");
    }

    if (styleSelect) {
        const allPatches = getAllStylePatchOptions();
        const builtIn = allPatches.filter((p) => p.builtIn);
        const custom = allPatches.filter((p) => !p.builtIn);
        const groups = [`<optgroup label="内置">${builtIn.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}</optgroup>`];
        if (custom.length) {
            groups.push(`<optgroup label="自定义">${custom.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}</optgroup>`);
        }
        styleSelect.innerHTML = groups.join("");
    }
}

function populateApiProfileOptions() {
    const select = document.getElementById("cc-api-profile-select");
    if (!select) {
        return;
    }

    select.innerHTML = "";
    select.insertAdjacentHTML("beforeend", `<option value="">${t("settings.apiProfileManual")}</option>`);
    listApiProfiles().forEach((profile) => {
        select.insertAdjacentHTML(
            "beforeend",
            `<option value="${profile.id}">${profile.name}</option>`,
        );
    });
}

function fillForm() {
    const settings = getSettings();
    const promptProfile = getPromptProfileById(settings.promptProfileId, settings);
    setValue("cc-provider-mode", settings.summaryGenerationMode);
    setValue("cc-api-profile-select", settings.currentApiProfileId);
    setValue("cc-provider-model", settings.independentApiConfig.model);
    setValue("cc-provider-url", settings.independentApiConfig.apiUrl);
    setValue("cc-provider-key", settings.independentApiConfig.apiKey);
    setValue("cc-prompt-profile", settings.promptProfileId);
    setValue("cc-prompt-system", promptProfile.systemPrompt);
    setValue("cc-prompt-user-template", promptProfile.userTemplate);
    setValue("cc-fusion-system", settings.fusionSystemPrompt || "");
    setValue("cc-fusion-user-template", settings.fusionUserTemplate || "");
    setValue("cc-style-patch", settings.stylePatchId);
    setValue("cc-style-patch-text", getStylePatchText(settings.stylePatchId, settings));
    setChecked("cc-fanfic-patch", settings.fanficPatchEnabled);
    setValue("cc-fanfic-patch-text", getFanficPatchText(settings));
    setChecked("cc-content-compatibility-patch", settings.contentCompatibilityPatchEnabled);
    setValue("cc-content-compatibility-patch-text", getContentCompatibilityPatchText(settings));
    setChecked("cc-auto-inject", settings.autoInjectApproved);
    setValue("cc-inject-position", settings.injectionPosition ?? 0);
    setValue("cc-inject-depth-mode", settings.injectionDepthMode ?? "manual");
    setValue("cc-inject-depth", settings.injectionDepth ?? 1);
    setValue("cc-inject-role", settings.injectionRole ?? 0);
    setValue("cc-inject-wrap-tag", settings.injectionWrapTag || "");
    refreshInjectionCompatibility();
    refreshInjectionDepthControl();
    setValue("cc-summary-response-length", settings.summaryResponseLength ?? 0);
    setValue("cc-fusion-response-length", settings.fusionResponseLength ?? 0);
    updatePositionHint();
    setValue("cc-default-range-size", settings.defaultRangeSize);
    setValue(
        "cc-summary-filter-fragments",
        Array.isArray(settings.summaryFilterFragments)
            ? settings.summaryFilterFragments.join("\n")
            : "",
    );
    setPromptEditorBaseline(promptProfile);
    refreshPromptEditorUi();
}

function bindSettingsEvents() {
    const syncLiveGenerationSettings = ({ refreshRange = false } = {}) => {
        const settings = getSettings();
        updateIndependentApiConfig({
            model: getValue("cc-provider-model").trim(),
            apiUrl: getValue("cc-provider-url").trim(),
            apiKey: getValue("cc-provider-key").trim(),
        });
        updateSettings({
            summaryGenerationMode: getValue("cc-provider-mode") || settings.summaryGenerationMode,
            summaryResponseLength: normalizeNonNegativeInteger(
                getValue("cc-summary-response-length"),
                settings.summaryResponseLength || 0,
            ),
            fusionResponseLength: normalizeNonNegativeInteger(
                getValue("cc-fusion-response-length"),
                settings.fusionResponseLength || 0,
            ),
            defaultRangeSize: Math.max(
                1,
                normalizeNonNegativeInteger(getValue("cc-default-range-size"), settings.defaultRangeSize || 20),
            ),
            summaryFilterFragments: getValue("cc-summary-filter-fragments")
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            contentCompatibilityPatchEnabled: isChecked("cc-content-compatibility-patch"),
        });
        refreshStatusPanel();
        if (refreshRange) {
            fillSuggestedDraftRange();
        }
    };

    for (const id of [
        "cc-provider-mode",
        "cc-provider-url",
        "cc-provider-key",
        "cc-provider-model",
        "cc-summary-response-length",
        "cc-fusion-response-length",
        "cc-content-compatibility-patch",
    ]) {
        document.getElementById(id)?.addEventListener("change", () => {
            syncLiveGenerationSettings();
        });
    }

    document.getElementById("cc-model-list")?.addEventListener("change", () => {
        setValue("cc-provider-model", getValue("cc-model-list"));
        syncLiveGenerationSettings();
    });

    document.getElementById("cc-default-range-size")?.addEventListener("change", () => {
        syncLiveGenerationSettings({ refreshRange: true });
    });

    document.getElementById("cc-summary-filter-fragments")?.addEventListener("change", () => {
        syncLiveGenerationSettings();
    });

    // Injection controls — auto-save on change
    for (const id of ["cc-auto-inject", "cc-inject-position", "cc-inject-depth-mode", "cc-inject-depth", "cc-inject-role", "cc-inject-wrap-tag"]) {
        const evType = id === "cc-inject-wrap-tag" ? "change" : "change";
        document.getElementById(id)?.addEventListener(evType, async () => {
            const injectionDepthMode = getValue("cc-inject-depth-mode") === "auto" ? "auto" : "manual";
            const injectionPatch = {
                autoInjectApproved: isChecked("cc-auto-inject"),
                injectionPosition: Number(getValue("cc-inject-position")) || 0,
                injectionDepthMode,
                injectionRole: Number(getValue("cc-inject-role")) || 0,
                injectionWrapTag: getValue("cc-inject-wrap-tag").trim(),
            };
            if (injectionDepthMode === "manual") {
                injectionPatch.injectionDepth = normalizeNonNegativeInteger(getValue("cc-inject-depth"), 1);
            }
            updateSettings(injectionPatch);
            updatePositionHint();
            refreshInjectionDepthControl();
            await syncInjectionPrompt();
            refreshStatusPanel();
            refreshSegmentsPanel();
        });
    }
    // Also update hint on position change
    document.getElementById("cc-inject-position")?.addEventListener("change", updatePositionHint);

    // Style patch — show text on change
    document.getElementById("cc-style-patch")?.addEventListener("change", () => {
        const settings = getSettings();
        settings.stylePatchId = getValue("cc-style-patch");
        updateSettings({ stylePatchId: settings.stylePatchId });
        setValue("cc-style-patch-text", getStylePatchText(settings.stylePatchId, settings));
    });

    // Style patch — save (overwrite current custom patch)
    document.getElementById("cc-style-patch-save")?.addEventListener("click", () => {
        const settings = getSettings();
        const currentId = settings.stylePatchId;
        const isBuiltIn = !!STYLE_PATCH_TEXT.hasOwnProperty(currentId);
        if (isBuiltIn) {
            notify("warning", "内置补丁不能直接覆盖，请使用「另存为」。");
            return;
        }
        try {
            const existing = (settings.customStylePatches || []).find((p) => p.id === currentId);
            upsertCustomStylePatch({ id: currentId, label: existing?.label || currentId, text: getValue("cc-style-patch-text") }, settings);
            updateSettings({});
            notify("success", "风格补丁已保存。");
        } catch (e) { notify("error", e.message); }
    });

    // Style patch — save as new
    document.getElementById("cc-style-patch-save-as")?.addEventListener("click", () => {
        const name = globalThis.prompt?.("请输入新的风格补丁名称");
        if (!name) return;
        try {
            const settings = getSettings();
            const newId = upsertCustomStylePatch({ label: name, text: getValue("cc-style-patch-text") }, settings);
            updateSettings({ stylePatchId: newId });
            populatePromptOptions();
            setValue("cc-style-patch", newId);
            notify("success", `已保存风格补丁：${name}`);
        } catch (e) { notify("error", e.message); }
    });

    // Style patch — delete
    document.getElementById("cc-style-patch-delete")?.addEventListener("click", () => {
        const settings = getSettings();
        const isBuiltIn = !!STYLE_PATCH_TEXT.hasOwnProperty(settings.stylePatchId);
        if (isBuiltIn) { notify("warning", "内置补丁不能删除。"); return; }
        const deleted = deleteCustomStylePatch(settings.stylePatchId, settings);
        updateSettings({});
        populatePromptOptions();
        fillForm();
        if (deleted) notify("info", `已删除风格补丁：${deleted.label}`);
    });

    // Style patch — reset to built-in default
    document.getElementById("cc-style-patch-reset")?.addEventListener("click", () => {
        const settings = getSettings();
        const builtInText = STYLE_PATCH_TEXT[settings.stylePatchId] || "";
        setValue("cc-style-patch-text", builtInText);
        notify("info", "已恢复为内置默认正文。如需保留请点保存。");
    });

    // Fanfic patch — save
    document.getElementById("cc-fanfic-patch-save")?.addEventListener("click", () => {
        updateSettings({ fanficPatchText: getValue("cc-fanfic-patch-text").trim() });
        notify("success", "同人补丁已保存。");
    });

    // Fanfic patch — reset
    document.getElementById("cc-fanfic-patch-reset")?.addEventListener("click", () => {
        updateSettings({ fanficPatchText: "" });
        setValue("cc-fanfic-patch-text", FANFIC_PATCH_TEXT);
        notify("info", "已恢复为内置默认正文。");
    });

    document.getElementById("cc-content-compatibility-patch-save")?.addEventListener("click", () => {
        updateSettings({
            contentCompatibilityPatchEnabled: isChecked("cc-content-compatibility-patch"),
            contentCompatibilityPatchText: normalizeContentCompatibilityPatchText(
                getValue("cc-content-compatibility-patch-text"),
            ),
        });
        notify("success", t("toast.contentCompatibilitySaved"));
        refreshStatusPanel();
    });

    document.getElementById("cc-content-compatibility-patch-reset")?.addEventListener("click", () => {
        updateSettings({
            contentCompatibilityPatchEnabled: true,
            contentCompatibilityPatchText: "",
        });
        setChecked("cc-content-compatibility-patch", true);
        setValue("cc-content-compatibility-patch-text", CONTENT_COMPATIBILITY_PATCH_TEXT);
        notify("info", t("toast.contentCompatibilityReset"));
        refreshStatusPanel();
    });

    // Fusion prompt — save edits
    document.getElementById("cc-fusion-save")?.addEventListener("click", () => {
        updateSettings({
            fusionSystemPrompt: getValue("cc-fusion-system"),
            fusionUserTemplate: getValue("cc-fusion-user-template"),
        });
        notify("success", t("toast.fusionPromptSaved"));
    });

    // Fusion prompt — reset to built-in default
    document.getElementById("cc-fusion-reset")?.addEventListener("click", () => {
        updateSettings({
            fusionSystemPrompt: DEFAULT_SETTINGS.fusionSystemPrompt,
            fusionUserTemplate: DEFAULT_SETTINGS.fusionUserTemplate,
        });
        setValue("cc-fusion-system", DEFAULT_SETTINGS.fusionSystemPrompt);
        setValue("cc-fusion-user-template", DEFAULT_SETTINGS.fusionUserTemplate);
        notify("info", t("toast.fusionPromptReset"));
    });

    document.getElementById("cc-prompt-profile")?.addEventListener("change", () => {
        const settings = getSettings();
        const nextProfileId = getValue("cc-prompt-profile");
        if (promptEditorState.dirty) {
            const shouldDiscard = globalThis.confirm?.(t("promptNote.discardConfirm"));
            if (!shouldDiscard) {
                setValue("cc-prompt-profile", promptEditorState.loadedProfileId);
                return;
            }
        }

        const nextProfile = getPromptProfileById(nextProfileId, settings);
        const patch = {};
        patch.promptProfileId = nextProfileId;
        // Restore saved patch state from the profile
        if (!nextProfile.builtIn && nextProfile.stylePatchId !== undefined) {
            patch.stylePatchId = nextProfile.stylePatchId;
        }
        if (!nextProfile.builtIn && nextProfile.fanficPatchEnabled !== undefined) {
            patch.fanficPatchEnabled = nextProfile.fanficPatchEnabled;
        }
        if (!nextProfile.builtIn && nextProfile.contentCompatibilityPatchEnabled !== undefined) {
            patch.contentCompatibilityPatchEnabled = nextProfile.contentCompatibilityPatchEnabled;
        }
        updateSettings(patch);
        populatePromptOptions();
        fillForm();
        refreshStatusPanel();
    });

    document.getElementById("cc-prompt-system")?.addEventListener("input", handlePromptEditorInput);
    document.getElementById("cc-prompt-user-template")?.addEventListener("input", handlePromptEditorInput);

    document.getElementById("cc-api-profile-select")?.addEventListener("change", () => {
        applyApiProfile(getValue("cc-api-profile-select"));
        fillForm();
        refreshStatusPanel();
    });

    document.getElementById("cc-api-save")?.addEventListener("click", () => {
        const currentProfileId = getValue("cc-api-profile-select");
        const currentProfile = listApiProfiles().find((profile) => profile.id === currentProfileId) || null;

        updateSettings({
            summaryGenerationMode: getValue("cc-provider-mode") || getSettings().summaryGenerationMode,
        });
        updateIndependentApiConfig({
            model: getValue("cc-provider-model").trim(),
            apiUrl: getValue("cc-provider-url").trim(),
            apiKey: getValue("cc-provider-key").trim(),
        });

        if (!currentProfile) {
            notify("success", t("toast.apiSettingsSaved"));
            refreshStatusPanel();
            return;
        }

        const savedProfile = saveActiveApiProfile();
        populateApiProfileOptions();
        fillForm();
        notify("success", t("toast.apiProfileUpdated", { name: savedProfile?.name || currentProfile.name }));
        refreshStatusPanel();
    });

    document.getElementById("cc-api-profile-save")?.addEventListener("click", () => {
        const name = globalThis.prompt?.(t("apiProfilePrompt"));
        if (!name) {
            return;
        }
        try {
            updateSettings({
                summaryGenerationMode: getValue("cc-provider-mode") || getSettings().summaryGenerationMode,
            });
            updateIndependentApiConfig({
                model: getValue("cc-provider-model").trim(),
                apiUrl: getValue("cc-provider-url").trim(),
                apiKey: getValue("cc-provider-key").trim(),
            });
            saveCurrentApiProfile(name);
            populateApiProfileOptions();
            fillForm();
            notify("success", t("toast.apiProfileSaved", { name }));
            refreshStatusPanel();
        } catch (error) {
            notify("error", error.message);
        }
    });

    document.getElementById("cc-api-profile-delete")?.addEventListener("click", () => {
        const profile = deleteCurrentApiProfile();
        if (!profile) {
            notify("warning", t("toast.apiProfileNone"));
            return;
        }
        populateApiProfileOptions();
        fillForm();
        notify("info", t("toast.apiProfileDeleted", { name: profile.name }));
        refreshStatusPanel();
    });

    document.getElementById("cc-prompt-profile-save")?.addEventListener("click", () => {
        const settings = getSettings();
        const currentProfile = getPromptProfileById(settings.promptProfileId, settings);

        if (currentProfile.builtIn) {
            notify("warning", t("toast.promptBuiltInNoOverwrite"));
            return;
        }

        try {
            upsertCustomPromptProfile(
                {
                    id: currentProfile.id,
                    label: currentProfile.label,
                    systemPrompt: getValue("cc-prompt-system"),
                    userTemplate: getValue("cc-prompt-user-template"),
                    stylePatchId: getValue("cc-style-patch"),
                    fanficPatchEnabled: isChecked("cc-fanfic-patch"),
                    contentCompatibilityPatchEnabled: isChecked("cc-content-compatibility-patch"),
                },
                settings,
            );
            updateSettings({});
            populatePromptOptions();
            fillForm();
            notify("success", t("toast.promptProfileSaved", { name: currentProfile.label }));
        } catch (error) {
            notify("error", error.message);
        }
    });

    document.getElementById("cc-prompt-profile-save-as")?.addEventListener("click", () => {
        const name = globalThis.prompt?.(t("apiProfilePrompt"));
        if (!name) {
            return;
        }

        try {
            const settings = getSettings();
            upsertCustomPromptProfile(
                {
                    label: name,
                    systemPrompt: getValue("cc-prompt-system"),
                    userTemplate: getValue("cc-prompt-user-template"),
                    stylePatchId: getValue("cc-style-patch"),
                    fanficPatchEnabled: isChecked("cc-fanfic-patch"),
                    contentCompatibilityPatchEnabled: isChecked("cc-content-compatibility-patch"),
                },
                settings,
            );
            updateSettings({});
            populatePromptOptions();
            fillForm();
            notify("success", t("toast.promptProfileSaved", { name }));
            refreshStatusPanel();
        } catch (error) {
            notify("error", error.message);
        }
    });

    document.getElementById("cc-prompt-profile-delete")?.addEventListener("click", () => {
        const settings = getSettings();
        const currentProfile = getPromptProfileById(settings.promptProfileId, settings);
        if (currentProfile.builtIn) {
            notify("warning", t("toast.promptBuiltInNoDelete"));
            return;
        }

        const deleted = deleteCustomPromptProfile(currentProfile.id, settings);
        updateSettings({});
        populatePromptOptions();
        fillForm();
        if (deleted) {
            notify("info", t("toast.promptProfileDeleted", { name: deleted.label }));
        }
        refreshStatusPanel();
    });

    document.getElementById("cc-save-settings")?.addEventListener("click", async () => {
        updateIndependentApiConfig({
            model: getValue("cc-provider-model"),
            apiUrl: getValue("cc-provider-url"),
            apiKey: getValue("cc-provider-key"),
        });

        updateSettings({
            summaryGenerationMode: getValue("cc-provider-mode"),
            promptProfileId: getValue("cc-prompt-profile"),
            stylePatchId: getValue("cc-style-patch"),
            fanficPatchEnabled: isChecked("cc-fanfic-patch"),
            contentCompatibilityPatchEnabled: isChecked("cc-content-compatibility-patch"),
            contentCompatibilityPatchText: normalizeContentCompatibilityPatchText(
                getValue("cc-content-compatibility-patch-text"),
            ),
            summaryResponseLength: normalizeNonNegativeInteger(getValue("cc-summary-response-length"), 0),
            fusionResponseLength: normalizeNonNegativeInteger(getValue("cc-fusion-response-length"), 0),
            autoInjectApproved: isChecked("cc-auto-inject"),
            injectionPosition: Number(getValue("cc-inject-position")) || 0,
            injectionDepthMode: getValue("cc-inject-depth-mode") === "auto" ? "auto" : "manual",
            ...(getValue("cc-inject-depth-mode") === "auto"
                ? {}
                : { injectionDepth: normalizeNonNegativeInteger(getValue("cc-inject-depth"), 1) }),
            injectionRole: Number(getValue("cc-inject-role")) || 0,
            injectionWrapTag: getValue("cc-inject-wrap-tag").trim(),
            defaultRangeSize: Number(getValue("cc-default-range-size")) || 20,
            summaryFilterFragments: getValue("cc-summary-filter-fragments")
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            fusionSystemPrompt: getValue("cc-fusion-system"),
            fusionUserTemplate: getValue("cc-fusion-user-template"),
        });

        await syncInjectionPrompt();
        notify("success", t("toast.settingsSaved"));
        refreshStatusPanel();
        refreshSegmentsPanel();
        fillSuggestedDraftRange();
    });
}

function getValue(id) {
    return document.getElementById(id)?.value ?? "";
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value ?? "";
    }
}

function isChecked(id) {
    return !!document.getElementById(id)?.checked;
}

function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.checked = !!value;
    }
}

function handlePromptEditorInput() {
    promptEditorState.dirty =
        getValue("cc-prompt-system") !== promptEditorState.baselineSystemPrompt ||
        getValue("cc-prompt-user-template") !== promptEditorState.baselineUserTemplate;
    refreshPromptEditorUi();
}

function setPromptEditorBaseline(profile) {
    promptEditorState.loadedProfileId = profile.id;
    promptEditorState.loadedBuiltIn = !!profile.builtIn;
    promptEditorState.baselineSystemPrompt = profile.systemPrompt;
    promptEditorState.baselineUserTemplate = profile.userTemplate;
    promptEditorState.dirty = false;
}

function refreshPromptEditorUi() {
    const note = document.getElementById("cc-prompt-editor-note");
    const saveButton = document.getElementById("cc-prompt-profile-save");
    const deleteButton = document.getElementById("cc-prompt-profile-delete");

    if (saveButton) {
        saveButton.disabled = promptEditorState.loadedBuiltIn;
    }

    if (deleteButton) {
        deleteButton.disabled = promptEditorState.loadedBuiltIn;
    }

    if (!note) {
        return;
    }

    note.classList.remove("cc-note-warning", "cc-note-dirty");

    if (promptEditorState.loadedBuiltIn && promptEditorState.dirty) {
        note.textContent = t("promptNote.builtInDirty");
        note.classList.add("cc-note-warning", "cc-note-dirty");
        return;
    }

    if (promptEditorState.loadedBuiltIn) {
        note.textContent = t("promptNote.builtInClean");
        note.classList.add("cc-note-warning");
        return;
    }

    if (promptEditorState.dirty) {
        note.textContent = t("promptNote.customDirty");
        note.classList.add("cc-note-dirty");
        return;
    }

    note.textContent = t("promptNote.customClean");
}

function updatePositionHint() {
    const hint = document.getElementById("cc-inject-position-hint");
    if (!hint) return;
    const pos = getValue("cc-inject-position");
    const map = { "2": t("inject.positionBeforeHint"), "0": t("inject.positionAfterHint"), "1": t("inject.positionChatHint") };
    hint.textContent = map[pos] || "";
}

export function refreshInjectionCompatibility() {
    const positionSelect = document.getElementById("cc-inject-position");
    const characterOption = positionSelect?.querySelector('option[value="0"]');
    const notice = document.getElementById("cc-inject-position-unsupported");
    const unavailable = !isCharacterLayerAvailable();
    const selectedCharacterLayer = String(getSettings().injectionPosition ?? 0) === "0";

    if (characterOption) {
        characterOption.disabled = unavailable;
    }

    if (notice) {
        notice.hidden = !unavailable || !selectedCharacterLayer;
        notice.textContent = unavailable && selectedCharacterLayer
            ? t("inject.positionUnsupported")
            : "";
    }
}

async function loadSidebarHtml() {
    const mountPoint = document.querySelector(SETTINGS_MOUNT_SELECTOR);
    if (!mountPoint) {
        return;
    }
    if (document.getElementById("chat-compactor-sidebar")) {
        return;
    }
    try {
        const url = new URL("../../settings.html", import.meta.url);
        const html = await fetch(url).then((r) => r.text());
        mountPoint.insertAdjacentHTML("beforeend", html);
    } catch {
        // settings.html load failed; sidebar entry won't appear, panel still works
    }
}

function bindSidebarEvents() {
    document.getElementById("cc-open-panel-sidebar")?.addEventListener("click", openPanel);
    document.getElementById("cc-show-trigger")?.addEventListener("change", (e) => {
        setTriggerVisible(e.target.checked);
    });
}
