import { t } from "../i18n.js";
import { normalizeNonNegativeInteger, notify } from "../utils.js";
import { generateDraftForRange } from "../services/summary-draft-service.js";
import { getDraft, saveDraftSegment } from "../state/chat-segment-store.js";
import { approveDraft, getCurrentDraft, rejectDraft } from "../services/approval-service.js";
import { syncInjectionPrompt } from "../services/injection-service.js";
import { refreshStatusPanel } from "./status-panel.js";
import { refreshSegmentsPanel } from "./segments-panel.js";
import { refreshInjectionDepthControl } from "./injection-depth-control.js";
import { getSettings, updateIndependentApiConfig, updateSettings } from "../state/settings-store.js";
import { getSuggestedDraftRange } from "../services/range-suggestion-service.js";
import { normalizeContentCompatibilityPatchText } from "../prompts/prompt-registry.js";

let currentDraftId = null;

export function bindDraftPanel() {
    document.getElementById("cc-fill-next-range")?.addEventListener("click", () => {
        fillSuggestedDraftRange();
        notify("info", t("toast.rangeFilled"));
    });

    document.getElementById("cc-generate-draft")?.addEventListener("click", async () => {
        const startFloor = Number(document.getElementById("cc-range-start")?.value || 0);
        const endFloor = Number(document.getElementById("cc-range-end")?.value || 0);
        const preview = document.getElementById("cc-draft-preview");

        if (!preview) {
            return;
        }

        if (!Number.isFinite(startFloor) || !Number.isFinite(endFloor) || startFloor < 1 || endFloor < startFloor) {
            notify("warning", t("toast.invalidRange"));
            return;
        }

        preview.textContent = t("workspace.generating");

        try {
            syncGenerationSettingsFromForm();
            const draft = await generateDraftForRange({
                startMes: startFloor - 1,
                endMes: endFloor - 1,
            });

            saveDraftSegment(draft);
            currentDraftId = draft.id;
            renderDraftPreview(draft);
            refreshStatusPanel();
            notify("success", t("toast.draftGenerated"));
        } catch (error) {
            preview.textContent = `${t("draft.generateFailed")}\n${error.message}`;
            notify("error", error.message);
        }
    });

    document.getElementById("cc-approve-draft")?.addEventListener("click", async () => {
        try {
            const result = approveDraft(currentDraftId);
            currentDraftId = null;
            await syncInjectionPrompt();
            refreshInjectionDepthControl();
            renderApprovedSummaryPreview(result.cumulativeSummary);
            refreshStatusPanel();
            refreshSegmentsPanel();
            fillSuggestedDraftRange();
            notify("success", t("toast.draftApproved"));
        } catch (error) {
            notify("error", error.message);
        }
    });

    document.getElementById("cc-reject-draft")?.addEventListener("click", () => {
        try {
            rejectDraft(currentDraftId);
            currentDraftId = null;
            renderCurrentDraft();
            refreshStatusPanel();
            fillSuggestedDraftRange();
            notify("info", t("toast.draftRejected"));
        } catch (error) {
            notify("error", error.message);
        }
    });

    fillSuggestedDraftRange();
    renderCurrentDraft();
}

function syncGenerationSettingsFromForm() {
    const settings = getSettings();
    const defaultRangeSize = Math.max(
        1,
        normalizeNonNegativeInteger(
            getInputValue("cc-default-range-size"),
            settings.defaultRangeSize || 20,
        ),
    );

    updateIndependentApiConfig({
        model: getInputValue("cc-provider-model").trim(),
        apiUrl: getInputValue("cc-provider-url").trim(),
        apiKey: getInputValue("cc-provider-key").trim(),
    });

    updateSettings({
        summaryGenerationMode: getInputValue("cc-provider-mode") || settings.summaryGenerationMode,
        promptProfileId: getInputValue("cc-prompt-profile") || settings.promptProfileId,
        stylePatchId: getInputValue("cc-style-patch") || settings.stylePatchId,
        fanficPatchEnabled: isInputChecked("cc-fanfic-patch"),
        contentCompatibilityPatchEnabled: isInputChecked("cc-content-compatibility-patch"),
        contentCompatibilityPatchText: normalizeContentCompatibilityPatchText(
            getInputValue("cc-content-compatibility-patch-text"),
        ),
        summaryResponseLength: normalizeNonNegativeInteger(
            getInputValue("cc-summary-response-length"),
            settings.summaryResponseLength || 0,
        ),
        defaultRangeSize,
        summaryFilterFragments: getInputValue("cc-summary-filter-fragments")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
    });
}

export function fillSuggestedDraftRange() {
    const settings = getSettings();
    const range = getSuggestedDraftRange(settings.defaultRangeSize);
    const startInput = document.getElementById("cc-range-start");
    const endInput = document.getElementById("cc-range-end");
    if (startInput) {
        startInput.value = String(range.startFloor);
    }
    if (endInput) {
        endInput.value = String(range.endFloor);
    }
}

function renderCurrentDraft() {
    const draft = currentDraftId ? getDraft(currentDraftId) : getCurrentDraft();
    const preview = document.getElementById("cc-draft-preview");
    if (!preview) {
        return;
    }

    if (!draft) {
        preview.textContent = t("workspace.noDraft");
        return;
    }

    renderDraftPreview(draft);
}

function renderDraftPreview(draft) {
    const preview = document.getElementById("cc-draft-preview");
    if (!preview) {
        return;
    }

    const parseErrorText = draft.response.parseError
        ? `\n\n[Parse warning]\n${draft.response.parseError}`
        : "";

    preview.textContent = [
        `${t("draft.id")}：${draft.id}`,
        `${t("draft.floorRange")}：#${draft.range.startFloor}-${draft.range.endFloor}`,
        `${t("draft.requestedMode")}：${draft.providerInfo.requestedMode}`,
        `${t("draft.resolvedMode")}：${draft.providerInfo.resolvedMode}${draft.providerInfo.model ? ` / ${draft.providerInfo.model}` : ""}`,
        draft.providerInfo.fallbackUsed ? `${t("draft.fallbackNote")}：${draft.providerInfo.fallbackReason}` : "",
        draft.providerInfo.emptyRetryUsed ? `${t("draft.emptyRetry")}：${draft.providerInfo.emptyRetryReason || t("draft.emptyRetryUsed")}` : "",
        draft.providerInfo.localFallbackUsed ? `${t("draft.localFallback")}：${draft.providerInfo.localFallbackReason || ""}` : "",
        "",
        `【${t("draft.archiveBody")}】`,
        draft.response.archiveSummary || t("draft.empty"),
        parseErrorText,
    ].join("\n");
}

function renderApprovedSummaryPreview(cumulativeSummary) {
    const preview = document.getElementById("cc-draft-preview");
    if (!preview) {
        return;
    }

    preview.textContent = [
        `【${t("draft.archiveBody")}】`,
        cumulativeSummary || t("draft.empty"),
    ].join("\n");
}

function getInputValue(id) {
    return document.getElementById(id)?.value ?? "";
}

function isInputChecked(id) {
    return !!document.getElementById(id)?.checked;
}
