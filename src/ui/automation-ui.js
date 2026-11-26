import { t } from "../i18n.js";
import { notify } from "../utils.js";
import { getSettings } from "../state/settings-store.js";
import { selectAutomaticRange, automaticProviderReady } from "../services/automation-policy.js";
import { renderCurrentDraft } from "./draft-panel.js";
import { refreshSegmentsPanel } from "./segments-panel.js";
import { refreshStatusPanel } from "./status-panel.js";
import { refreshInjectionDepthControl } from "./injection-depth-control.js";

let runtime;
let renderedKey = null;
let formDirty = false;
const byId = id => document.getElementById(`cc-automation-${id}`);

function reasonText(code) {
    const key = `automation.reason.${code}`;
    const text = t(key);
    return text === key ? t("automation.reason.generation-failed") : text;
}

export function mountAutomationUi(service) {
    runtime = service;
    byId("help")?.addEventListener("click", openAutomationHelp);
    byId("toggle")?.addEventListener("click", () => byId("toggle").setAttribute("aria-expanded",
        String(!byId("settings").classList.contains("cc-collapsed"))));
    for (const field of ["mode", "batch", "keep", "hide"]) {
        byId(field)?.addEventListener("input", () => { formDirty = true; updateOptions(); });
    }
    const action = (id, fn) => byId(id)?.addEventListener("click", async () => {
        try { await fn(); refreshAutomationUi(true); }
        catch (error) {
            runtime.state().reason = error.code || "generation-failed";
            notify("warning", reasonText(runtime.state().reason));
            refreshAutomationUi();
        }
    });
    action("save", async () => {
        if (!byId("batch").reportValidity() || !byId("keep").reportValidity()) return;
        const patch = { mode: byId("mode").value, batchSize: Number(byId("batch").value),
            keepRecent: Number(byId("keep").value), hideAfterApprove: byId("hide").checked };
        if (patch.mode !== "manual" && !runtime.host.capable()) throw { code: "capability-unavailable" };
        await runtime.manual(async target => {
            const reason = patch.mode === "manual" ? "" : automaticProviderReady(getSettings());
            Object.assign(runtime.state(), patch, { paused: !!reason, reason, status: reason ? "paused" : "waiting" });
            await runtime.actions.saveState(target);
        });
        formDirty = false;
        if (patch.mode !== "manual") runtime.schedule();
    });
    action("pause", async () => {
        runtime.state().paused = true;
        runtime.state().reason = "user-paused";
        runtime.cancel();
        await runtime.manual(target => {
            Object.assign(runtime.state(), { paused: true, reason: "user-paused", status: "paused" });
            return runtime.actions.saveState(target);
        });
    });
    action("resume", async () => {
        await runtime.manual(async target => {
            Object.assign(runtime.state(), { paused: false, reason: "", status: "waiting" });
            await runtime.actions.saveState(target);
        });
        runtime.schedule();
    });
    action("recover", () => runtime.manual(target => runtime.actions.recover(target), { recovery: true }));
    action("undo", () => runtime.manual(target => runtime.actions.undo(target)));
    refreshAutomationUi(true);
}

function openAutomationHelp() {
    const modal = document.getElementById("cc-modal");
    if (!modal) return;
    const existing = modal.querySelector(".cc-help-overlay");
    if (existing) { existing.querySelector("button")?.focus(); return; }
    const opener = byId("help");
    const overlay = document.createElement("section");
    overlay.className = "cc-help-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "cc-automation-help-title");
    const header = document.createElement("div");
    header.className = "cc-help-header";
    const title = document.createElement("h2");
    title.id = "cc-automation-help-title";
    title.textContent = t("automation.help.title");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cc-btn cc-btn-sm";
    close.textContent = t("automation.help.close");
    const dismiss = () => { overlay.remove(); opener?.focus({ preventScroll: true }); };
    close.addEventListener("click", dismiss);
    header.append(title, close);
    const body = document.createElement("div");
    body.className = "cc-help-body";
    body.tabIndex = 0;
    body.setAttribute("aria-label", t("automation.help.title"));
    for (const topic of ["start", "modes", "schedule", "example", "editing", "hiding", "controls", "undo", "troubleshooting", "requirements"]) {
        const section = document.createElement("section");
        const heading = document.createElement("h3");
        const paragraph = document.createElement("p");
        heading.textContent = t(`automation.help.${topic}.title`);
        paragraph.textContent = t(`automation.help.${topic}.body`);
        section.append(heading, paragraph);
        body.append(section);
    }
    overlay.append(header, body);
    overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key === "Tab") {
            event.preventDefault();
            (document.activeElement === close ? body : close).focus();
        }
    });
    modal.append(overlay);
    close.focus();
}

function updateOptions() {
    const mode = byId("mode")?.value;
    if (byId("options")) byId("options").hidden = mode === "manual";
    if (byId("hide-row")) byId("hide-row").hidden = mode !== "auto-approve";
}

export function refreshAutomationUi(force = false) {
    if (!runtime || !byId("mode")) return;
    const config = runtime.state();
    const target = runtime.host.identity();
    if (renderedKey !== target?.key) { formDirty = false; renderedKey = target?.key; force = true; }
    if (force || !formDirty) {
        byId("mode").value = config.mode;
        byId("batch").value = config.batchSize;
        byId("keep").value = config.keepRecent;
        byId("hide").checked = config.hideAfterApprove;
    }
    updateOptions();
    const state = config.mode === "manual" ? "manual" : runtime.busy ? (config.status === "generating" ? "generating" : "committing") : config.pending ? "awaiting-review" :
        config.paused ? "paused" : runtime.busy ? config.status : config.status || "waiting";
    byId("state").textContent = t(`automation.state.${state}`);
    const store = runtime.host.context().chatMetadata?.extensions?.chat_compactor || {};
    const selected = selectAutomaticRange(runtime.host.context().chat || [], store.approvedRanges || [], config, Symbol.for("ignore"));
    byId("next").textContent = selected.range
        ? `${t("automation.next")}: ${selected.range.startFloor}–${selected.range.endFloor} · ${t("automation.keepRecent")}: ${config.keepRecent}`
        : reasonText(selected.reason || "waiting");
    byId("reason").textContent = config.reason ? reasonText(config.reason) : "";
    const settings = getSettings();
    byId("profile").textContent = `${t("automation.profile")}: ${settings.promptProfileId} / ${settings.stylePatchId} / ${settings.summaryGenerationMode}${settings.summaryGenerationMode === "independent-api" ? ` / ${settings.independentApiConfig.model}` : ""}`;
    const unresolved = config.journal && !["completed", "undone", "invalidated"].includes(config.journal.phase);
    byId("pause").disabled = !target || config.mode === "manual" || config.paused;
    byId("resume").disabled = !target || runtime.busy || config.mode === "manual" || !config.paused || !!config.pending || !!unresolved;
    byId("recover").hidden = !unresolved;
    byId("recover").disabled = runtime.busy;
    byId("undo").disabled = !target || runtime.busy || config.journal?.phase !== "completed";
    byId("save").disabled = !target || runtime.busy || !!unresolved || config.schemaVersion !== 1;
    for (const id of ["cc-generate-draft", "cc-approve-draft", "cc-reject-draft"]) {
        const button = document.getElementById(id);
        if (button) button.disabled = runtime.busy || !!unresolved;
    }
    if (!runtime.busy) renderCurrentDraft();
    refreshSegmentsPanel();
    refreshStatusPanel();
    refreshInjectionDepthControl();
}
