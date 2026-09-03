import { t } from "../i18n.js";
import { getSettings, updateSettings } from "../state/settings-store.js";

const ID = { trigger:"cc-trigger", overlay:"cc-overlay", modal:"cc-modal", close:"cc-modal-close", style:"cc-panel-injected-style" };

const THEMES = {
    auto:  null,
    slate: { bg:"#182028", surface:"#232d39", fieldBg:"#121920", border:"#435366", text:"#eef3f7", dim:"#9eb0c3", accent:"#e4b35d", accentSoft:"rgba(228,179,93,.16)" },
    ocean: { bg:"#0d1721", surface:"#152534", fieldBg:"#0a1219", border:"#3f607f", text:"#edf6ff", dim:"#86a3c0", accent:"#69b8ff", accentSoft:"rgba(105,184,255,.16)" },
    mocha: { bg:"#1a1412", surface:"#2e231d", fieldBg:"#140f0c", border:"#5e4b3e", text:"#f2e8e0", dim:"#9e8878", accent:"#c09070", accentSoft:"rgba(192,144,112,.18)" },
    rose:  { bg:"#1d1821", surface:"#3a2f3a", fieldBg:"#16111a", border:"#756277", text:"#f6edf3", dim:"#af95a3", accent:"#d28faf", accentSoft:"rgba(210,143,175,.18)" },
    snow:  { bg:"#f4f2ea", surface:"#faf8f2", fieldBg:"#fffdf7", border:"#d4ccbd", text:"#2e2a24", dim:"#73695b", accent:"#786a56", accentSoft:"rgba(120,106,86,.14)" },
    frost: { bg:"#d8e6ef", surface:"#e5f0f6", fieldBg:"#f2faff", border:"#a8c0cf", text:"#1f3341", dim:"#617b8d", accent:"#5d9fd6", accentSoft:"rgba(93,159,214,.16)" },
};

let triggerVisible = true;
let currentThemeId = "auto";

/* ===== Public ===== */
export function buildAndMountPanel() {
    if (document.getElementById(ID.trigger)) return;
    currentThemeId = getSettings().themeId || "auto";
    injectStyles();
    const btn = document.createElement("div"); btn.id = ID.trigger; btn.className = "cc-trigger";
    btn.innerHTML = `<div class="cc-trigger-core"><i class="fa-solid fa-box-archive"></i></div>`;
    document.body.appendChild(btn); positionTrigger(btn, { force: true }); makeDraggable(btn, () => openPanel());
    const ov = document.createElement("dialog"); ov.id = ID.overlay; ov.className = "cc-overlay";
    ov.innerHTML = modalHtml(); document.body.appendChild(ov);
    const reposition = () => positionTrigger(btn);
    globalThis.addEventListener?.("resize", reposition);
    globalThis.addEventListener?.("orientationchange", reposition);
    bindPanelChrome(); applyTheme(currentThemeId);
    enhanceAllTextareas();
}
export function openPanel() {
    const o = document.getElementById(ID.overlay);
    if (!o) return;
    if (typeof o.showModal === "function") {
        if (o.open) return;
        try {
            o.showModal();
            o.classList.remove("cc-dialog-fallback");
            return;
        } catch (_) {
            // Fall through to non-modal open for older/hostile webviews.
        }
    }
    o.classList.add("cc-dialog-fallback");
    o.setAttribute("open", "");
}
export function closePanel() {
    const o = document.getElementById(ID.overlay);
    if (!o) return;
    o.classList.remove("cc-dialog-fallback");
    if (typeof o.close === "function" && o.open) {
        o.close();
        return;
    }
    o.removeAttribute("open");
}
export function togglePanel(){ openPanel(); }
export function setTriggerVisible(v){ triggerVisible=v; const e=document.getElementById(ID.trigger); if(e) e.style.display=v?"flex":"none"; }

/* ===== Theme ===== */
function applyTheme(id) {
    const modal = document.getElementById(ID.modal); if (!modal) return;
    const trigger = document.getElementById(ID.trigger);
    currentThemeId = id;
    const p = THEMES[id];
    if (!p) {
        modal.removeAttribute("style");
        if (trigger) { trigger.style.removeProperty("background"); trigger.style.removeProperty("border-color"); trigger.style.removeProperty("color"); trigger.style.removeProperty("box-shadow"); }
    } else {
        const vars = {"--cc-bg":p.bg,"--cc-surface":p.surface,"--cc-field":p.fieldBg,"--cc-border":p.border,"--cc-text":p.text,"--cc-dim":p.dim,"--cc-accent":p.accent,"--cc-accent-soft":p.accentSoft};
        Object.entries(vars).forEach(([k,v])=>modal.style.setProperty(k,v));
        if (trigger) { trigger.style.background=p.bg; trigger.style.borderColor=p.border; trigger.style.color=p.text; trigger.style.boxShadow=`0 6px 20px rgba(0,0,0,.35)`; }
    }
    document.querySelectorAll(".cc-theme-btn").forEach(b=>b.classList.toggle("active",b.dataset.theme===id));
}

/* ===== HTML ===== */
function modalHtml() {
    return `<div id="${ID.modal}" class="cc-modal">
        <div class="cc-header"><div class="cc-title"><strong>${t("extensionName")}</strong><span>${t("workspace.desc")}</span></div><button id="${ID.close}" class="cc-close-btn">×</button></div>
        <nav class="cc-tabs"><button class="cc-tab active" data-cc-tab="workspace">${t("workspace.title")}</button><button class="cc-tab" data-cc-tab="summary">${t("segments.title")}</button><button class="cc-tab" data-cc-tab="settings">${t("settings.title")}</button></nav>
        <div class="cc-body">${workspacePage()}${summaryPage()}${settingsPage()}</div></div>`;
}
function workspacePage(){return `<section class="cc-page active" data-cc-page="workspace">
    <div class="cc-card"><div class="cc-g3">
        <label class="cc-field"><span>${t("workspace.rangeStart")}</span><input id="cc-range-start" class="cc-input" type="number" min="1" step="1"></label>
        <label class="cc-field"><span>${t("workspace.rangeEnd")}</span><input id="cc-range-end" class="cc-input" type="number" min="1" step="1"></label>
        <label class="cc-field"><span>${t("workspace.defaultRangeSize")}</span><input id="cc-default-range-size" class="cc-input" type="number" min="1" max="200" step="1"></label>
    </div><div class="cc-hint">${t("workspace.rangeHint")}</div></div>
    <div class="cc-card"><label class="cc-field"><span>${t("workspace.filterFragments")}</span><textarea id="cc-summary-filter-fragments" class="cc-textarea" rows="3" placeholder="${t("workspace.filterFragmentsPlaceholder")}"></textarea></label><div class="cc-hint">${t("workspace.filterHint")}</div></div>
    <div class="cc-actions"><button id="cc-fill-next-range" class="cc-btn">${t("workspace.fillRange")}</button><button id="cc-generate-draft" class="cc-btn cc-btn-accent">${t("workspace.generateDraft")}</button><button id="cc-approve-draft" class="cc-btn">${t("workspace.approveDraft")}</button><button id="cc-reject-draft" class="cc-btn">${t("workspace.rejectDraft")}</button><button id="cc-save-settings" class="cc-btn">${t("workspace.saveSettings")}</button></div>
    <div class="cc-card cc-pre" id="cc-draft-preview">${t("workspace.noDraft")}</div>
</section>`;}
function summaryPage(){return `<section class="cc-page" data-cc-page="summary">
    <div id="cc-status-box" class="cc-card"></div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("inject.title")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-hint">${t("inject.strategyDesc")}</div>
        <div class="cc-inject-row">
            <label class="cc-field-row"><input id="cc-auto-inject" type="checkbox"><span>${t("inject.enable")}</span></label>
            <div class="cc-hint" style="margin:0;padding-left:26px">${t("inject.enableDesc")}</div>
        </div>
        <div class="cc-g2" style="margin-top:12px">
            <label class="cc-field"><span>${t("inject.position")}</span>
                <select id="cc-inject-position" class="cc-input">
                    <option value="2">${t("inject.positionBefore")}</option>
                    <option value="0">${t("inject.positionAfter")}</option>
                    <option value="1">${t("inject.positionChat")}</option>
                </select>
                <div class="cc-hint" id="cc-inject-position-hint"></div>
                <div class="cc-hint cc-warning" id="cc-inject-position-unsupported" hidden></div>
            </label>
            <label class="cc-field"><span>${t("inject.role")}</span>
                <select id="cc-inject-role" class="cc-input">
                    <option value="0">${t("inject.roleSystem")}</option>
                    <option value="1">${t("inject.roleUser")}</option>
                    <option value="2">${t("inject.roleAssistant")}</option>
                </select>
            </label>
        </div>
        <div class="cc-g2" style="margin-top:10px">
            <label class="cc-field"><span>${t("inject.depth")}</span>
                <select id="cc-inject-depth-mode" class="cc-input">
                    <option value="manual">${t("inject.depthModeManual")}</option>
                    <option value="auto">${t("inject.depthModeAuto")}</option>
                </select>
                <input id="cc-inject-depth" class="cc-input" type="number" min="0" max="999" step="1">
                <div class="cc-hint">${t("inject.depthDesc")}</div>
                <div class="cc-hint cc-warning" id="cc-inject-depth-auto-note" hidden></div>
                <div class="cc-hint" id="cc-inject-depth-floor-hint" hidden></div>
            </label>
            <label class="cc-field"><span>${t("inject.wrapTag")}</span>
                <input id="cc-inject-wrap-tag" class="cc-input" type="text" placeholder="${t("inject.wrapTagPlaceholder")}">
                <div class="cc-hint">${t("inject.wrapTagDesc")}</div>
            </label>
        </div>
        <div class="cc-inject-note">${t("inject.attentionNote")}</div>
        </div>
    </div>
    <div id="cc-segment-list">${t("segments.empty")}</div>
</section>`;}
function settingsPage(){
    const tb=Object.keys(THEMES).map(id=>{
        const label=id==="auto"?"Auto":id[0].toUpperCase()+id.slice(1);
        const p=THEMES[id];
        const sw=p?`background:linear-gradient(135deg,${p.surface},${p.bg});border:1px solid ${p.border};`:`background:transparent;border:1px dashed currentColor;`;
        return `<button class="cc-theme-btn${currentThemeId===id?" active":""}" data-theme="${id}"><span class="cc-theme-swatch" style="${sw}"></span><span class="cc-theme-label">${label}</span></button>`;
    }).join("");
    return `<section class="cc-page" data-cc-page="settings">
    <div class="cc-card"><div class="cc-card-head"><strong>主题</strong></div><div class="cc-theme-grid">${tb}</div></div>
    <div class="cc-card cc-collapsible">
        <div class="cc-card-head cc-collapse-toggle"><strong>API</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-g2"><label class="cc-field"><span>${t("settings.providerMode")}</span><select id="cc-provider-mode" class="cc-input"><option value="shared-api">${t("settings.providerModeShared")}</option><option value="independent-api">${t("settings.providerModeIndependent")}</option></select></label><label class="cc-field"><span>${t("settings.apiProfile")}</span><select id="cc-api-profile-select" class="cc-input"><option value="">${t("settings.apiProfileManual")}</option></select></label></div>
        <div class="cc-g2"><label class="cc-field"><span>${t("settings.apiUrl")}</span><input id="cc-provider-url" class="cc-input" type="text" placeholder="https://..."></label><label class="cc-field"><span>${t("settings.apiKey")}</span><input id="cc-provider-key" class="cc-input" type="password"></label></div>
        <div class="cc-g2"><label class="cc-field"><span>${t("settings.model")}</span><div class="cc-input-row"><input id="cc-provider-model" class="cc-input" type="text"><button id="cc-fetch-models" class="cc-btn cc-btn-sm" title="Fetch Models"><i class="fa-solid fa-rotate"></i></button></div></label><label class="cc-field"><span>&nbsp;</span><select id="cc-model-list" class="cc-input" style="display:none;"></select></label></div>
        <div class="cc-actions"><button id="cc-api-save" class="cc-btn">${t("settings.apiSave")}</button><button id="cc-api-profile-save" class="cc-btn">${t("settings.apiProfileSave")}</button><button id="cc-api-profile-delete" class="cc-btn">${t("settings.apiProfileDelete")}</button></div>
        </div>
    </div>
    <div class="cc-card cc-collapsible">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.tokenControl")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-g2">
            <label class="cc-field"><span>${t("settings.summaryResponseLength")}</span><input id="cc-summary-response-length" class="cc-input" type="number" min="0" step="1"></label>
            <label class="cc-field"><span>${t("settings.fusionResponseLength")}</span><input id="cc-fusion-response-length" class="cc-input" type="number" min="0" step="1"></label>
        </div>
        <div class="cc-hint">${t("settings.responseLengthHint")}</div>
        </div>
    </div>
    <div class="cc-card cc-collapsible">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.promptProfile")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-g2"><label class="cc-field"><span>${t("settings.promptProfile")}</span><select id="cc-prompt-profile" class="cc-input"></select></label></div>
        <div class="cc-actions"><button id="cc-prompt-profile-save" class="cc-btn">${t("settings.promptProfileSave")}</button><button id="cc-prompt-profile-save-as" class="cc-btn">${t("settings.promptProfileSaveAs")}</button><button id="cc-prompt-profile-delete" class="cc-btn">${t("settings.promptProfileDelete")}</button></div>
        <div id="cc-prompt-editor-note" class="cc-prompt-note"></div><div class="cc-hint">${t("settings.promptHintNewUser")}</div>
        </div>
    </div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.systemPrompt")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <label class="cc-field"><span>${t("settings.systemPrompt")}</span><textarea id="cc-prompt-system" class="cc-textarea" rows="10"></textarea></label>
        <label class="cc-field"><span>${t("settings.userTemplate")}</span><textarea id="cc-prompt-user-template" class="cc-textarea" rows="10"></textarea></label>
        <div class="cc-hint">${t("settings.promptVariableHint")}</div>
        </div>
    </div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.stylePatch")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-g2">
            <label class="cc-field"><span>当前补丁</span><select id="cc-style-patch" class="cc-input"></select></label>
        </div>
        <div class="cc-patch-desc" id="cc-style-patch-desc"></div>
        <label class="cc-field" style="margin-top:10px"><span>补丁提示词正文</span><textarea id="cc-style-patch-text" class="cc-textarea" rows="8" placeholder="留空 = 不使用风格补丁"></textarea></label>
        <div class="cc-actions">
            <button id="cc-style-patch-save" class="cc-btn">${t("settings.promptProfileSave")}</button>
            <button id="cc-style-patch-save-as" class="cc-btn">${t("settings.promptProfileSaveAs")}</button>
            <button id="cc-style-patch-delete" class="cc-btn">${t("settings.promptProfileDelete")}</button>
            <button id="cc-style-patch-reset" class="cc-btn">恢复默认</button>
        </div>
        </div>
    </div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.fanficPatch")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-inject-row">
            <label class="cc-field-row"><input id="cc-fanfic-patch" type="checkbox"><span>启用同人二创补丁</span></label>
            <div class="cc-hint" style="margin:0;padding-left:26px">当剧情与原作不同时以当前聊天为准，适用于 AU、私设、魔改世界观。</div>
        </div>
        <label class="cc-field" style="margin-top:10px"><span>补丁提示词正文</span><textarea id="cc-fanfic-patch-text" class="cc-textarea" rows="6"></textarea></label>
        <div class="cc-actions">
            <button id="cc-fanfic-patch-save" class="cc-btn">保存修改</button>
            <button id="cc-fanfic-patch-reset" class="cc-btn">恢复默认</button>
        </div>
        </div>
    </div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.contentCompatibilityPatch")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-inject-row">
            <label class="cc-field-row"><input id="cc-content-compatibility-patch" type="checkbox"><span>${t("settings.contentCompatibilityEnable")}</span></label>
            <div class="cc-hint" style="margin:0;padding-left:26px">${t("settings.contentCompatibilityHint")}</div>
        </div>
        <label class="cc-field" style="margin-top:10px"><span>${t("settings.contentCompatibilityText")}</span><textarea id="cc-content-compatibility-patch-text" class="cc-textarea" rows="10"></textarea></label>
        <div class="cc-actions">
            <button id="cc-content-compatibility-patch-save" class="cc-btn">${t("settings.contentCompatibilitySave")}</button>
            <button id="cc-content-compatibility-patch-reset" class="cc-btn">${t("settings.contentCompatibilityReset")}</button>
        </div>
        </div>
    </div>
    <div class="cc-card cc-collapsible cc-collapsed">
        <div class="cc-card-head cc-collapse-toggle"><strong>${t("settings.fusionSystem")}</strong><i class="fa-solid fa-chevron-down cc-collapse-icon"></i></div>
        <div class="cc-collapse-body">
        <div class="cc-hint">${t("settings.fusionHint")}</div>
        <label class="cc-field"><span>${t("settings.fusionSystem")}</span><textarea id="cc-fusion-system" class="cc-textarea" rows="6"></textarea></label>
        <label class="cc-field"><span>${t("settings.fusionUserTemplate")}</span><textarea id="cc-fusion-user-template" class="cc-textarea" rows="6"></textarea></label>
        <div class="cc-actions">
            <button id="cc-fusion-save" class="cc-btn">${t("settings.fusionSave")}</button>
            <button id="cc-fusion-reset" class="cc-btn">${t("settings.fusionReset")}</button>
        </div>
        </div>
    </div>
</section>`;}

/* ===== Chrome binding ===== */
function bindPanelChrome(){
    document.getElementById(ID.close)?.addEventListener("click",closePanel);
    document.getElementById(ID.overlay)?.addEventListener("cancel",(event)=>event.preventDefault());
    // Sidebar events are bound by settings-ui.js after loading settings.html
    document.querySelectorAll(".cc-tab").forEach(tab=>{tab.addEventListener("click",()=>{
        const tgt=tab.dataset.ccTab; if(!tgt)return;
        document.querySelectorAll(".cc-tab").forEach(t=>t.classList.remove("active"));
        document.querySelectorAll(".cc-page").forEach(p=>p.classList.remove("active"));
        tab.classList.add("active");
        document.querySelector(`.cc-page[data-cc-page="${tgt}"]`)?.classList.add("active");
    });});
    document.querySelectorAll(".cc-theme-btn").forEach(btn=>{btn.addEventListener("click",()=>{applyTheme(btn.dataset.theme);updateSettings({themeId:btn.dataset.theme});});});
    // Collapsible cards
    document.querySelectorAll(".cc-collapse-toggle").forEach(toggle=>{toggle.addEventListener("click",()=>{const card=toggle.closest(".cc-collapsible");if(card)card.classList.toggle("cc-collapsed");});});
    // Style patch visual description
    document.getElementById("cc-style-patch")?.addEventListener("change",updateStylePatchDesc);
    setTimeout(updateStylePatchDesc,100);
    document.getElementById("cc-fetch-models")?.addEventListener("click",async()=>{
        const{fetchAvailableModels,notify}=await import("../utils.js");
        const url=document.getElementById("cc-provider-url")?.value, key=document.getElementById("cc-provider-key")?.value;
        const mi=document.getElementById("cc-provider-model"), ml=document.getElementById("cc-model-list");
        try{const models=await fetchAvailableModels(url,key);if(!models.length){notify("warning","未找到可用模型");return;}
            if(ml){ml.innerHTML=models.map(m=>`<option value="${m}">${m}</option>`).join("");ml.style.display="";ml.value=mi?.value||models[0];
                if(mi){mi.value=ml.value;mi.dispatchEvent(new Event("change",{bubbles:true}));}
                ml.onchange=()=>{if(mi){mi.value=ml.value;mi.dispatchEvent(new Event("change",{bubbles:true}));}};}
            notify("success",`获取到 ${models.length} 个模型`);
        }catch(err){notify("error",`获取模型失败: ${err.message}`);}
    });
}

const STYLE_PATCH_DESCS = {
    "none":          "不额外修改总结风格，使用主预设的默认输出。",
    "light-natural": "轻松自然 — 日常、玩笑、温馨场景保持轻松语气，不强行写得沉重冷硬。",
    "dense-archive": "细节存档 — 高保真详细记录，尽量多保留动作细节、对话核心和条件内容。",
    "plot-skeleton": "剧情骨架 — 突出推进链：情报、线索、任务、权力变化，跳过氛围和闲聊。",
    "rp-friendly":   "续演友好 — 低存在感记录，只保留续写真正需要记住的信息，不压住角色表演。",
};

function updateStylePatchDesc() {
    const desc = document.getElementById("cc-style-patch-desc");
    if (!desc) return;
    const val = document.getElementById("cc-style-patch")?.value || "none";
    desc.textContent = STYLE_PATCH_DESCS[val] || "";
}

/* ===== Fullscreen editor (shared) ===== */

export function openFullscreenEditor(text, onApply, title = "全屏编辑", { search = false } = {}) {
    const modal = document.getElementById(ID.modal);
    if (!modal) return;
    let overlay = modal.querySelector(".cc-fs-overlay");
    if (overlay) overlay.remove();

    const searchHtml = search ? `
        <div class="cc-fs-search">
            <input class="cc-input" data-cc-fs="search-input" type="text" placeholder="搜索…">
            <button class="cc-btn cc-btn-sm" data-cc-fs="search-prev" title="上一个"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="cc-btn cc-btn-sm" data-cc-fs="search-next" title="下一个"><i class="fa-solid fa-chevron-down"></i></button>
            <span class="cc-search-count" data-cc-fs="search-count"></span>
        </div>` : "";

    overlay = document.createElement("div");
    overlay.className = "cc-fs-overlay";
    overlay.innerHTML = `
        <div class="cc-fs-header">
            <strong>${title}</strong>
            <div class="cc-fs-actions">
                <button class="cc-btn" data-cc-fs="cancel">取消</button>
                <button class="cc-btn cc-btn-accent" data-cc-fs="apply">应用</button>
            </div>
        </div>
        ${searchHtml}
        <textarea class="cc-textarea cc-fs-textarea"></textarea>
    `;
    modal.appendChild(overlay);
    const fsTA = overlay.querySelector(".cc-fs-textarea");
    fsTA.value = text;
    requestAnimationFrame(() => fsTA.focus());
    overlay.querySelector("[data-cc-fs=cancel]").addEventListener("click", () => overlay.remove());
    overlay.querySelector("[data-cc-fs=apply]").addEventListener("click", () => {
        onApply(fsTA.value);
        overlay.remove();
    });

    if (search) {
        bindFsSearch(overlay, fsTA);
    }
}

function bindFsSearch(overlay, ta) {
    const input = overlay.querySelector("[data-cc-fs=search-input]");
    const countEl = overlay.querySelector("[data-cc-fs=search-count]");
    if (!input) return;
    let lastText = "", lastPos = -1;

    const doSearch = (dir) => {
        const q = input.value.trim();
        if (!q) { lastPos = -1; lastText = ""; if (countEl) countEl.textContent = ""; return; }
        const tLow = ta.value.toLowerCase(), qLow = q.toLowerCase();
        const matches = [];
        let p = -1;
        while ((p = tLow.indexOf(qLow, p + 1)) !== -1) matches.push(p);
        if (!matches.length) { if (countEl) countEl.textContent = "无匹配"; lastPos = -1; return; }
        if (q !== lastText) { lastPos = -1; lastText = q; }
        let idx;
        if (dir === "next") { idx = matches.findIndex(m => m > lastPos); if (idx === -1) idx = 0; }
        else { idx = -1; for (let i = matches.length - 1; i >= 0; i--) { if (matches[i] < lastPos) { idx = i; break; } } if (idx === -1) idx = matches.length - 1; }
        lastPos = matches[idx];
        ta.focus();
        ta.setSelectionRange(lastPos, lastPos + q.length);
        // Scroll
        const mirror = document.createElement("div");
        const st = getComputedStyle(ta);
        mirror.style.cssText = "position:absolute;top:-9999px;left:-9999px;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;";
        mirror.style.width = st.width; mirror.style.font = st.font; mirror.style.padding = st.padding;
        mirror.style.lineHeight = st.lineHeight; mirror.style.boxSizing = st.boxSizing;
        mirror.textContent = ta.value.substring(0, lastPos);
        const marker = document.createElement("span"); marker.textContent = "|"; mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const markerTop = marker.offsetTop;
        document.body.removeChild(mirror);
        ta.scrollTop = Math.max(0, markerTop - ta.clientHeight / 3);
        if (countEl) countEl.textContent = `${idx + 1}/${matches.length}`;
    };

    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doSearch(e.shiftKey ? "prev" : "next"); } });
    overlay.querySelector("[data-cc-fs=search-prev]")?.addEventListener("click", () => doSearch("prev"));
    overlay.querySelector("[data-cc-fs=search-next]")?.addEventListener("click", () => doSearch("next"));
}

function enhanceAllTextareas() {
    const modal = document.getElementById(ID.modal);
    if (!modal) return;
    // Only long-text textareas get the expand button
    const longTextIds = [
        "cc-cumulative-summary",
        "cc-prompt-system",
        "cc-prompt-user-template",
        "cc-style-patch-text",
        "cc-fanfic-patch-text",
        "cc-content-compatibility-patch-text",
        "cc-fusion-system",
        "cc-fusion-user-template",
    ];
    const searchIds = new Set(["cc-cumulative-summary"]);
    for (const id of longTextIds) {
        const ta = modal.querySelector(`#${id}`);
        if (!ta || ta.dataset.ccExpand === "bound") continue;
        ta.dataset.ccExpand = "bound";
        const btn = document.createElement("button");
        btn.className = "cc-fullscreen-btn";
        btn.title = "全屏编辑";
        btn.type = "button";
        btn.innerHTML = `<i class="fa-solid fa-expand"></i>`;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const label = ta.closest(".cc-field")?.querySelector("span")?.textContent || "全屏编辑";
            const useSearch = searchIds.has(id);
            openFullscreenEditor(ta.value, (newText) => {
                ta.value = newText;
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                ta.dispatchEvent(new Event("change", { bubbles: true }));
            }, label, { search: useSearch });
        });
        ta.insertAdjacentElement("afterend", btn);
    }
}

// Re-export for segments-panel to call after dynamic render
export { enhanceAllTextareas };

/* ===== Drag ===== */
function makeDraggable(el,onClick){
    let d=false,sx,sy,sl,st;
    el.addEventListener("pointerdown",e=>{d=false;sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect();sl=r.left;st=r.top;el.setPointerCapture(e.pointerId);e.preventDefault();});
    el.addEventListener("pointermove",e=>{if(!el.hasPointerCapture(e.pointerId))return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>4||Math.abs(dy)>4)d=true;if(d){el.dataset.ccDragged="1";el.style.transform="none";el.style.left=`${sl+dx}px`;el.style.top=`${st+dy}px`;el.style.right="auto";el.style.bottom="auto";}});
    el.addEventListener("pointerup",e=>{el.releasePointerCapture(e.pointerId);if(!d&&onClick)onClick();});
}

function resolveMobileTriggerTop() {
    const topBar =
        document.querySelector(".top-settings-holder") ||
        document.querySelector("#top-bar");

    if (topBar && typeof topBar.getBoundingClientRect === "function") {
        return `${Math.max(78, Math.round(topBar.getBoundingClientRect().bottom) + 12)}px`;
    }

    return "88px";
}

function positionTrigger(trigger, { force = false } = {}) {
    if (!trigger) {
        return;
    }

    if (!force && trigger.dataset.ccDragged === "1") {
        return;
    }

    const isMobile = globalThis.matchMedia?.("(max-width: 720px)")?.matches || globalThis.innerWidth <= 720;
    trigger.style.left = "auto";
    trigger.style.transform = "none";

    if (isMobile) {
        trigger.style.top = resolveMobileTriggerTop();
        trigger.style.right = "max(12px, env(safe-area-inset-right, 0px))";
        trigger.style.bottom = "auto";
        return;
    }

    trigger.style.top = "auto";
    trigger.style.right = "18px";
    trigger.style.bottom = "84px";
}

/* ===== CSS ===== */
function injectStyles(){if(document.getElementById(ID.style))return;const s=document.createElement("style");s.id=ID.style;s.textContent=CSS;document.head.appendChild(s);}

const CSS = `
/* Trigger */
.cc-trigger{position:fixed;right:18px;bottom:84px;z-index:9000;width:44px;height:44px;border-radius:999px;border:1px solid #435366;background:#182028;color:#eef3f7;cursor:grab;box-shadow:0 6px 20px rgba(0,0,0,.35);touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center;transition:box-shadow .2s}
.cc-trigger:hover{box-shadow:0 8px 28px rgba(0,0,0,.45)}.cc-trigger:active{cursor:grabbing}
.cc-trigger-core{width:100%;height:100%;display:inline-flex;align-items:center;justify-content:center;border-radius:inherit;font-size:15px}

/* Overlay */
.cc-overlay{position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border:none;padding:14px;background:transparent;color:inherit;display:none;align-items:center;justify-content:center;box-sizing:border-box;overflow:visible}
.cc-overlay[open]{display:flex}
.cc-overlay::backdrop{background:rgba(0,0,0,.45);backdrop-filter:blur(6px)}
.cc-overlay.cc-dialog-fallback{z-index:2147483647;background:rgba(0,0,0,.45);backdrop-filter:blur(6px)}

/* Modal — plugin-owned default vars, overridden by theme inline styles */
.cc-modal{
    --cc-bg:#182028;--cc-surface:#232d39;--cc-field:#121920;
    --cc-border:#435366;--cc-text:#eef3f7;--cc-dim:#9eb0c3;
    --cc-accent:#e4b35d;--cc-accent-soft:rgba(228,179,93,.16);
    width:min(700px,calc(100vw - 28px));max-height:min(84dvh,calc(100dvh - 28px),880px);display:flex;flex-direction:column;overflow:hidden;position:relative;box-sizing:border-box;
    border:1px solid var(--cc-border);border-radius:18px;background:linear-gradient(180deg,var(--cc-surface) 0%,var(--cc-bg) 100%);
    color:var(--cc-text);box-shadow:0 20px 56px rgba(0,0,0,.5);font-family:inherit}

/* Header */
.cc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid color-mix(in srgb,var(--cc-border) 60%,transparent);flex-shrink:0}
.cc-title{display:flex;flex-direction:column;gap:3px}.cc-title strong{font-size:17px;font-weight:700;letter-spacing:.02em}.cc-title span{font-size:12px;color:var(--cc-dim);line-height:1.4}
.cc-close-btn{width:34px;height:34px;border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent);border-radius:12px;background:rgba(255,255,255,.04);color:var(--cc-text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}.cc-close-btn:hover{opacity:.7}

/* Tabs */
.cc-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 14px;border-bottom:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent);flex-shrink:0}
.cc-tab{border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent);border-radius:12px;background:color-mix(in srgb,var(--cc-bg) 70%,transparent);color:var(--cc-text);min-height:38px;font-size:13px;font-weight:700;cursor:pointer;opacity:.6;transition:opacity .15s,background .15s}
.cc-tab:hover{opacity:.85}.cc-tab.active{border-color:color-mix(in srgb,var(--cc-accent) 45%,transparent);background:var(--cc-accent-soft);opacity:1}

/* Body */
.cc-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:14px;overscroll-behavior:contain}
.cc-page{display:none}.cc-page.active{display:block}

/* Card */
.cc-card{border:1px solid color-mix(in srgb,var(--cc-border) 45%,transparent);border-radius:14px;background:color-mix(in srgb,var(--cc-surface) 50%,transparent);padding:14px}
.cc-card+.cc-card{margin-top:10px}.cc-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.cc-card-head strong{font-size:14px}

/* Collapsible cards */
.cc-collapse-toggle{cursor:pointer;user-select:none}
.cc-collapse-icon{font-size:11px;color:var(--cc-dim);transition:transform .2s}
.cc-collapsible.cc-collapsed .cc-collapse-icon{transform:rotate(-90deg)}
.cc-collapsible.cc-collapsed .cc-collapse-body{display:none}

/* Patch description */
.cc-patch-desc{font-size:.84em;color:var(--cc-accent);line-height:1.5;margin-top:8px;min-height:1.3em}
.cc-patch-card{margin-top:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--cc-border) 35%,transparent);border-radius:10px;background:color-mix(in srgb,var(--cc-field) 50%,transparent)}
.cc-pre{white-space:pre-wrap;font-size:.88em;line-height:1.6;min-height:50px}

/* Grid */
.cc-g2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.cc-g2+.cc-g2,.cc-g2+.cc-actions,.cc-g2+.cc-row{margin-top:10px}
.cc-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cc-grid-2col{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}

/* Fields */
.cc-field{display:flex;flex-direction:column;gap:5px}.cc-field>span{font-size:.88em;font-weight:600;color:var(--cc-dim)}
.cc-field+.cc-field{margin-top:10px}.cc-card>.cc-g2:first-child .cc-field,.cc-card>.cc-g3:first-child .cc-field,.cc-g2 .cc-field,.cc-g3 .cc-field{margin-top:0}
.cc-field-row{display:flex;align-items:center;gap:8px;cursor:pointer}.cc-field-row>span{font-size:.9em;font-weight:500;color:var(--cc-text)}
.cc-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px}
.cc-input-row{display:flex;gap:6px;align-items:stretch}.cc-input-row .cc-input{flex:1;min-width:0}

/* ===== Inputs — use theme vars, !important to override ST globals ===== */
.cc-modal .cc-input{border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent)!important;border-radius:12px!important;background:var(--cc-field)!important;color:var(--cc-text)!important;padding:9px 11px!important;min-height:38px;font-size:13px!important;font-family:inherit!important;width:100%;box-sizing:border-box}
.cc-modal .cc-textarea{border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent)!important;border-radius:12px!important;background:var(--cc-field)!important;color:var(--cc-text)!important;padding:10px 12px!important;min-height:90px;resize:vertical;font-family:"SFMono-Regular","Menlo","Consolas",monospace!important;font-size:.85em!important;line-height:1.55;width:100%;box-sizing:border-box}
.cc-modal .cc-input::placeholder,.cc-modal .cc-textarea::placeholder{color:var(--cc-dim)!important;opacity:.82!important}
.cc-modal .cc-input:focus,.cc-modal .cc-textarea:focus{outline:none!important;border-color:color-mix(in srgb,var(--cc-accent) 70%,var(--cc-border))!important;box-shadow:0 0 0 2px var(--cc-accent-soft)!important}
.cc-modal .cc-input:disabled,.cc-modal .cc-input[readonly],.cc-modal .cc-textarea:disabled,.cc-modal .cc-textarea[readonly]{opacity:.72!important;cursor:not-allowed!important}
.cc-modal select.cc-input option{background:var(--cc-field)!important;color:var(--cc-text)!important}
.cc-modal input[type="checkbox"]{width:17px;height:17px;cursor:pointer;flex-shrink:0}

/* Buttons — force horizontal text */
.cc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.cc-action-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.cc-btn{writing-mode:horizontal-tb!important;text-orientation:mixed!important;white-space:nowrap!important;word-break:keep-all!important;border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent);border-radius:12px;background:color-mix(in srgb,var(--cc-field) 90%,transparent);color:var(--cc-text);min-height:36px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:filter .12s}
.cc-btn:hover{filter:brightness(1.15)}.cc-btn:active{filter:brightness(.9)}.cc-btn:disabled{opacity:.4;cursor:default}
.cc-btn-accent{background:var(--cc-accent-soft);border-color:color-mix(in srgb,var(--cc-accent) 40%,transparent)}
.cc-btn-sm{min-height:36px;padding:6px 10px;min-width:auto}

/* Hints */
.cc-hint{font-size:.84em;color:var(--cc-dim);line-height:1.5;margin-top:6px}.cc-warning{color:#f0b35a}
.cc-prompt-note{font-size:.84em;line-height:1.5;margin-top:8px}.cc-note-warning{color:#f0b35a}.cc-note-dirty{color:#ffdf80;font-weight:600}
.cc-segment-meta{font-size:.84em;color:var(--cc-dim);line-height:1.5;margin-bottom:10px}.cc-segment-summary{min-height:160px}
.cc-inject-row{display:flex;flex-direction:column;gap:4px}
.cc-inject-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--cc-accent-soft);border:1px solid color-mix(in srgb,var(--cc-accent) 25%,transparent);font-size:.82em;line-height:1.55;color:var(--cc-text)}

/* Search bar */
.cc-search-bar{display:flex;align-items:center;gap:6px;margin-top:10px;margin-bottom:6px}
.cc-search-bar .cc-input{flex:1;min-width:0;min-height:34px;font-size:12.5px}
.cc-search-bar .cc-btn-sm{min-height:34px;padding:4px 8px}
.cc-search-count{font-size:.82em;color:var(--cc-dim);white-space:nowrap;min-width:50px;text-align:center}
.cc-token-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.cc-token-item{padding:10px 12px;border:1px solid color-mix(in srgb,var(--cc-border) 30%,transparent);border-radius:10px;background:color-mix(in srgb,var(--cc-field) 45%,transparent)}
.cc-token-item span{display:block;font-size:.82em;color:var(--cc-dim);margin-bottom:4px}
.cc-token-item strong{display:block;font-size:1em;font-weight:700;color:var(--cc-text)}
.cc-token-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--cc-field) 55%,transparent);border:1px solid color-mix(in srgb,var(--cc-border) 25%,transparent);font-size:.84em;line-height:1.55;color:var(--cc-text)}

/* Fullscreen expand button */
.cc-fullscreen-btn{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:8px;border:1px solid color-mix(in srgb,var(--cc-border) 40%,transparent);background:color-mix(in srgb,var(--cc-surface) 80%,transparent);color:var(--cc-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.5;transition:opacity .15s;z-index:1}
.cc-fullscreen-btn:hover{opacity:1}
.cc-ta-wrap{padding:0;position:relative}
.cc-field{position:relative}

/* Fullscreen overlay (inside modal) */
.cc-fs-overlay{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;background:var(--cc-bg);border-radius:18px;overflow:hidden}
.cc-fs-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid color-mix(in srgb,var(--cc-border) 60%,transparent);flex-shrink:0}
.cc-fs-header strong{font-size:15px}
.cc-fs-actions{display:flex;gap:8px}
.cc-fs-search{display:flex;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid color-mix(in srgb,var(--cc-border) 40%,transparent);flex-shrink:0}
.cc-fs-search .cc-input{flex:1;min-width:0;min-height:32px;font-size:12.5px}
.cc-fs-search .cc-btn-sm{min-height:32px;padding:4px 8px}
.cc-fs-search .cc-search-count{font-size:.82em;color:var(--cc-dim);white-space:nowrap;min-width:50px;text-align:center}
.cc-fs-textarea{flex:1!important;min-height:0!important;border:none!important;border-radius:0!important;resize:none!important;padding:14px 16px!important;font-size:.9em!important;line-height:1.6!important}

/* Status panel */
.cc-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px}
.cc-status-section{border:1px solid color-mix(in srgb,var(--cc-border) 35%,transparent);border-radius:12px;padding:10px 12px;background:color-mix(in srgb,var(--cc-field) 60%,transparent)}
.cc-status-heading{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cc-accent);margin-bottom:8px}
.cc-status-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;font-size:.88em}
.cc-status-row span{color:var(--cc-dim)}.cc-status-row strong{font-weight:600;font-size:.92em}
.cc-status-on{color:var(--cc-accent)}
.cc-status-floors{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.cc-status-floor-item{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 10px;border:1px solid color-mix(in srgb,var(--cc-border) 30%,transparent);border-radius:10px;background:color-mix(in srgb,var(--cc-field) 40%,transparent);font-size:.84em}
.cc-status-floor-item span{color:var(--cc-dim);white-space:nowrap}
.cc-status-floor-value{font-family:inherit;font-weight:700;word-break:break-all;text-align:right}
.cc-status-floor-empty{color:color-mix(in srgb,var(--cc-dim) 70%,transparent);font-weight:600}
.cc-status-floor-range{color:var(--cc-text);padding:1px 7px;border:1px solid color-mix(in srgb,var(--cc-border) 42%,transparent);border-radius:999px;background:color-mix(in srgb,var(--cc-surface) 38%,transparent)}
.cc-status-floor-danger{color:var(--cc-accent);border-color:color-mix(in srgb,var(--cc-accent) 58%,var(--cc-border));background:var(--cc-accent-soft)}

/* Theme grid */
.cc-theme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
.cc-theme-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid color-mix(in srgb,var(--cc-border) 50%,transparent);border-radius:12px;padding:8px 10px;background:color-mix(in srgb,var(--cc-field) 90%,transparent);color:var(--cc-text);cursor:pointer;min-height:36px;transition:border-color .15s}
.cc-theme-btn.active{border-color:var(--cc-accent);background:var(--cc-accent-soft)}.cc-theme-btn:hover{filter:brightness(1.1)}
.cc-theme-swatch{width:16px;height:16px;border-radius:999px;flex-shrink:0}.cc-theme-label{font-size:12px;font-weight:600}

/* Sidebar */
.cc-sb-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.cc-sb-check{display:flex;flex-direction:column;gap:4px;padding:6px 0}
.cc-sb-check-label{display:flex;align-items:center;gap:8px;font-weight:600;font-size:.92em;cursor:pointer}
.cc-sb-check-desc{font-size:.82em;opacity:.55;line-height:1.45;padding-left:26px}

/* ===== Tablet / constrained viewport ===== */
@media(max-width:1180px),(max-height:820px),(pointer:coarse){
    .cc-overlay{align-items:flex-start;justify-content:center;overflow-y:auto;padding:calc(env(safe-area-inset-top,0px) + 12px) max(12px, env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 12px) max(12px, env(safe-area-inset-left,0px))}
    .cc-modal{max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 24px)}
}

/* ===== Mobile ===== */
@media(max-width:720px){
    .cc-trigger{right:max(10px, env(safe-area-inset-right, 0px));top:calc(env(safe-area-inset-top, 0px) + 84px);bottom:auto}
    .cc-overlay{align-items:flex-start;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 12px}
    .cc-modal{width:min(92vw,390px);max-height:min(78dvh,700px);border-radius:16px}
    .cc-header{position:sticky;top:0;z-index:2;padding:12px 12px 8px}
    .cc-body{padding:10px 10px calc(env(safe-area-inset-bottom,0px) + 12px)}
    .cc-tabs{gap:6px;padding:8px 10px}
    .cc-tab{min-height:34px;font-size:12px}
    .cc-g2,.cc-g3,.cc-grid-2col,.cc-status-floors,.cc-token-grid{grid-template-columns:1fr}
    .cc-status-grid{grid-template-columns:1fr}
    .cc-theme-grid{grid-template-columns:repeat(2,1fr)}
    .cc-card{padding:10px}
    .cc-actions,.cc-action-row{gap:6px}
    .cc-btn{padding:6px 12px;font-size:12px;min-height:32px}
    .cc-fs-overlay{border-radius:16px}
    .cc-fs-header{padding:10px 12px}
    .cc-fs-textarea{padding:10px 12px!important;font-size:.85em!important}
    .cc-fullscreen-btn{top:6px;right:6px;width:26px;height:26px;font-size:10px}
    .cc-search-bar{flex-wrap:wrap}
    .cc-search-bar .cc-input{min-width:100%;margin-bottom:4px}
}
`;
