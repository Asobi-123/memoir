import { t, translateOperationError } from "../i18n.js";
import { debounce, notify } from "../utils.js";
import {
    clearAllApprovedSummaries,
    getApprovedBaselineSummary,
    getCumulativeSummary,
    saveCumulativeSummary,
} from "../state/chat-segment-store.js";
import { runFusionCompression } from "../services/fusion-service.js";
import { syncInjectionPrompt } from "../services/injection-service.js";
import { getApprovedSummaryTokenStats } from "../services/summary-token-service.js";
import { refreshStatusPanel } from "./status-panel.js";
import { refreshInjectionDepthControl } from "./injection-depth-control.js";
import { enhanceAllTextareas } from "./panel.js";
import { getCurrentChatKey } from "../core/context.js";
import { getAutomationRuntime, withManualOperation } from "../services/automation-service.js";
import {
    describeTokenStats,
    formatTokenValue,
} from "./token-stats-ui.js";

let isFusing = false;
let fuseSelection = { start: "", end: "" };
let lastSearchText = "";
let lastSearchPos = -1;
let tokenRenderVersion = 0;
let renderedChatKey = "";
let renderedFusing = false;
const unsavedEditors = new Map();

export function hasUnsavedSummaryEdits() {
    const textarea = document.getElementById("cc-cumulative-summary");
    return Boolean(document.querySelector(".cc-fs-overlay") || (renderedChatKey === getCurrentChatKey() && textarea &&
        (textarea.value !== getCumulativeSummary() || document.activeElement === textarea)));
}

export function refreshSegmentsPanel() {
    const root = document.getElementById("cc-segment-list");
    if (!root) return;
    const activeTextarea = root.querySelector("#cc-cumulative-summary");
    const chatKey = getCurrentChatKey();
    if (activeTextarea && activeTextarea.value !== activeTextarea.dataset.savedValue) {
        unsavedEditors.set(renderedChatKey, activeTextarea.value);
        if (renderedChatKey === chatKey) return;
    }
    if (renderedChatKey === chatKey && (document.querySelector(".cc-fs-overlay") ||
        (activeTextarea && document.activeElement === activeTextarea))) return;
    const activeSearch = root.querySelector("#cc-summary-search");
    if (renderedChatKey === chatKey && activeSearch && document.activeElement === activeSearch) return;

    const summary = getCumulativeSummary();
    if (activeTextarea && renderedChatKey === chatKey && activeTextarea.dataset.savedValue === summary && renderedFusing === isFusing) return;
    renderedFusing = isFusing;
    renderedChatKey = chatKey;
    root.innerHTML = `
      <div class="cc-hint" style="margin-bottom:12px">${esc(t("segments.desc"))}</div>
      <div class="cc-card">
        <div class="cc-card-head"><strong>${esc(t("segments.tokenStats"))}</strong></div>
        <div class="cc-token-grid">
          <div class="cc-token-item"><span>${esc(t("token.summaryText"))}</span><strong id="cc-summary-body-tokens">...</strong></div>
        </div>
        <div id="cc-summary-token-note" class="cc-token-note">${esc(t("segments.tokenLoading"))}</div>
      </div>
      <div class="cc-card">
        <div class="cc-g2">
          <label class="cc-field"><span>${esc(t("segments.fuseStart"))}</span>
            <input id="cc-fuse-start" class="cc-input" type="number" min="1" step="1" placeholder="1" value="${escA(fuseSelection.start)}"></label>
          <label class="cc-field"><span>${esc(t("segments.fuseEnd"))}</span>
            <input id="cc-fuse-end" class="cc-input" type="number" min="1" step="1" placeholder="5" value="${escA(fuseSelection.end)}"></label>
        </div>
        <div class="cc-hint">${esc(t("segments.fusionRecoveryHint"))}</div>
      </div>
      <div class="cc-search-bar">
        <input id="cc-summary-search" class="cc-input" type="text" placeholder="搜索总结内容…">
        <button id="cc-summary-search-prev" class="cc-btn cc-btn-sm" title="上一个"><i class="fa-solid fa-chevron-up"></i></button>
        <button id="cc-summary-search-next" class="cc-btn cc-btn-sm" title="下一个"><i class="fa-solid fa-chevron-down"></i></button>
        <span id="cc-summary-search-count" class="cc-search-count"></span>
      </div>
      <div class="cc-card cc-ta-wrap">
        <textarea id="cc-cumulative-summary" class="cc-textarea" style="min-height:320px;border:none;border-radius:14px;width:100%;box-sizing:border-box;">${esc(summary || "")}</textarea>
      </div>
      <div class="cc-actions">
        <button class="cc-btn" id="cc-cumulative-save">${esc(t("segments.save"))}</button>
        <button class="cc-btn" id="cc-cumulative-reset">${esc(t("segments.reset"))}</button>
        <button class="cc-btn cc-btn-accent" id="cc-cumulative-fuse" ${isFusing ? "disabled" : ""}>${esc(isFusing ? t("segments.fusing") : t("segments.fuse"))}</button>
        <button class="cc-btn" id="cc-cumulative-clear">${esc(t("segments.clear"))}</button>
      </div>`;
    const textarea = root.querySelector("#cc-cumulative-summary");
    textarea.dataset.savedValue = summary;
    if (unsavedEditors.has(chatKey)) textarea.value = unsavedEditors.get(chatKey);
    bindActions(root);
    bindSearch(root);
    enhanceAllTextareas();
}

function bindActions(root) {
    const ta = root.querySelector("#cc-cumulative-summary");
    bindTokenStats(root, ta);

    root.querySelector("#cc-cumulative-save")?.addEventListener("click", async () => {
        if (!(ta instanceof HTMLTextAreaElement)) return;
        try { await withManualOperation(async () => {
        saveCumulativeSummary(ta.value); await syncInjectionPrompt(); refreshInjectionDepthControl(); refreshStatusPanel();
        ta.dataset.savedValue = ta.value; unsavedEditors.delete(getCurrentChatKey());
        void renderTokenStats(root, ta.value);
        notify("success", t("toast.cumulativeSaved"));
        }, { invalidate: true }); } catch (e) { notify("error", translateOperationError(e)); }
    });
    root.querySelector("#cc-cumulative-reset")?.addEventListener("click", async () => {
        try { await withManualOperation(async () => {
        const bl = getApprovedBaselineSummary();
        if (ta instanceof HTMLTextAreaElement) ta.value = bl;
        saveCumulativeSummary(bl); await syncInjectionPrompt(); refreshInjectionDepthControl(); refreshStatusPanel();
        ta.dataset.savedValue = bl; unsavedEditors.delete(getCurrentChatKey());
        void renderTokenStats(root, bl);
        notify("info", t("toast.cumulativeReset"));
        }, { invalidate: true }); } catch (e) { notify("error", translateOperationError(e)); }
    });
    root.querySelector("#cc-cumulative-clear")?.addEventListener("click", async () => {
        if (!globalThis.confirm?.(t("toast.confirmClearAll"))) return;
        try { await withManualOperation(async () => {
        if (getAutomationRuntime()?.state().journal?.hiddenIndexes?.some(index =>
            getAutomationRuntime().host.context().chat[index]?.is_system)) throw Object.assign(new Error("hidden-history"), { code: "hidden-history" });
        clearAllApprovedSummaries(); await syncInjectionPrompt(); refreshInjectionDepthControl(); refreshStatusPanel(); refreshSegmentsPanel();
        unsavedEditors.delete(getCurrentChatKey());
        ta.value = ""; ta.dataset.savedValue = ""; refreshSegmentsPanel();
        notify("warning", t("toast.cumulativeCleared"));
        }, { invalidate: true }); } catch (e) { notify("error", translateOperationError(e)); }
    });
    root.querySelector("#cc-cumulative-fuse")?.addEventListener("click", async () => {
        if (isFusing) return;
        try {
            await withManualOperation(async () => {
            const si = Number(root.querySelector("#cc-fuse-start")?.value || 0);
            const ei = Number(root.querySelector("#cc-fuse-end")?.value || 0);
            fuseSelection = { start: si > 0 ? String(si) : "", end: ei > 0 ? String(ei) : "" };
            isFusing = true; refreshSegmentsPanel(); notify("info", t("toast.fusionStarted"));
            const result = await runFusionCompression({ startIndex: si > 0 ? si : null, endIndex: ei > 0 ? ei : null });
            await syncInjectionPrompt(); refreshInjectionDepthControl(); refreshStatusPanel();
            if (result.localFallbackUsed) {
                notify("warning", t("toast.fusionFallbackUsed"));
            } else if (result.emptyRetryUsed) {
                notify("success", t("toast.fusionDoneAfterRetry"));
            } else {
                notify("success", t("toast.fusionDone"));
            }
            }, { invalidate: true });
        } catch (e) { notify("error", translateOperationError(e)); } finally { isFusing = false; refreshSegmentsPanel(); }
    });
}

function bindTokenStats(root, textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
        return;
    }

    const debouncedRender = debounce((value) => {
        void renderTokenStats(root, value);
    }, 180);

    void renderTokenStats(root, textarea.value);
    textarea.addEventListener("input", () => {
        unsavedEditors.set(getCurrentChatKey(), textarea.value);
        const runtime = getAutomationRuntime();
        if (runtime && runtime.state().mode !== "manual") {
            runtime.cancel(); runtime.state().paused = true; runtime.state().reason = "manual-operation";
        }
        debouncedRender(textarea.value);
    });
}

function bindSearch(root) {
    const input = root.querySelector("#cc-summary-search");
    const ta = root.querySelector("#cc-cumulative-summary");
    const countEl = root.querySelector("#cc-summary-search-count");
    if (!input || !ta) return;

    const doSearch = (direction) => {
        const query = input.value.trim();
        if (!query) { lastSearchPos = -1; lastSearchText = ""; if (countEl) countEl.textContent = ""; return; }

        const text = ta.value;
        const qLow = query.toLowerCase();
        const tLow = text.toLowerCase();

        const matches = [];
        let p = -1;
        while ((p = tLow.indexOf(qLow, p + 1)) !== -1) matches.push(p);
        if (!matches.length) { if (countEl) countEl.textContent = "无匹配"; lastSearchPos = -1; return; }
        if (query !== lastSearchText) { lastSearchPos = -1; lastSearchText = query; }

        let idx;
        if (direction === "next") {
            idx = matches.findIndex((m) => m > lastSearchPos);
            if (idx === -1) idx = 0;
        } else {
            idx = -1;
            for (let i = matches.length - 1; i >= 0; i--) { if (matches[i] < lastSearchPos) { idx = i; break; } }
            if (idx === -1) idx = matches.length - 1;
        }

        const found = matches[idx];
        lastSearchPos = found;
        ta.focus();
        ta.setSelectionRange(found, found + query.length);
        scrollToPosition(ta, found);
        if (countEl) countEl.textContent = `${idx + 1}/${matches.length}`;
    };

    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(e.shiftKey ? "prev" : "next"); } });
    root.querySelector("#cc-summary-search-next")?.addEventListener("click", () => doSearch("next"));
    root.querySelector("#cc-summary-search-prev")?.addEventListener("click", () => doSearch("prev"));
}

function scrollToPosition(textarea, charIndex) {
    const mirror = document.createElement("div");
    const style = getComputedStyle(textarea);
    mirror.style.cssText = `position:absolute;top:-9999px;left:-9999px;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;`;
    mirror.style.width = style.width;
    mirror.style.font = style.font;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.boxSizing = style.boxSizing;
    const textBefore = textarea.value.substring(0, charIndex);
    mirror.textContent = textBefore;
    const marker = document.createElement("span");
    marker.textContent = "|";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerTop = marker.offsetTop;
    document.body.removeChild(mirror);
    textarea.scrollTop = Math.max(0, markerTop - textarea.clientHeight / 3);
}

async function renderTokenStats(root, summaryText) {
    const renderId = ++tokenRenderVersion;
    const note = root.querySelector("#cc-summary-token-note");
    if (note) {
        note.textContent = t("segments.tokenLoading");
    }

    const stats = await getApprovedSummaryTokenStats(summaryText);
    if (!root.isConnected || renderId !== tokenRenderVersion) {
        return;
    }

    setText(root, "#cc-summary-body-tokens", formatTokenValue(stats.summaryTokens, t));

    const noteText = describeTokenStats(stats, t);
    if (note) {
        note.textContent = noteText;
    }
}

function setText(root, selector, value) {
    const element = root.querySelector(selector);
    if (element) {
        element.textContent = value;
    }
}

function esc(s) { return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function escA(s) { return esc(s).replaceAll('"',"&quot;"); }
