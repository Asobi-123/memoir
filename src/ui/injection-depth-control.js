import { t } from "../i18n.js";
import { getAutomaticInjectionDepth } from "../services/range-state-service.js";
import { getSettings } from "../state/settings-store.js";

export function refreshInjectionDepthControl() {
    const settings = getSettings();
    const mode = settings.injectionDepthMode === "auto" ? "auto" : "manual";
    const isChatLayer = Number(settings.injectionPosition) === 1;
    const modeSelect = document.getElementById("cc-inject-depth-mode");
    const depthInput = document.getElementById("cc-inject-depth");
    const note = document.getElementById("cc-inject-depth-auto-note");
    const floorHint = document.getElementById("cc-inject-depth-floor-hint");
    const automaticDepth = isChatLayer && mode === "auto" ? getAutomaticInjectionDepth() : null;

    if (modeSelect) {
        modeSelect.value = mode;
        modeSelect.disabled = !isChatLayer;
    }
    if (depthInput) {
        depthInput.disabled = !isChatLayer || mode === "auto";
        depthInput.value = String(automaticDepth ?? settings.injectionDepth ?? 1);
    }

    if (note) {
        note.hidden = !isChatLayer || mode !== "auto";
        note.textContent = automaticDepth === null
            ? t("inject.depthAutoUnavailable")
            : t("inject.depthAutoCurrent", { depth: automaticDepth });
    }

    if (floorHint) {
        floorHint.hidden = !isChatLayer || mode !== "auto";
        floorHint.textContent = t("inject.depthAutoFloorHint");
    }
}
