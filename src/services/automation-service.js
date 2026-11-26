import { ensureAutomation, summarySnapshot, sameSummary, compactDraft, appendSummaryToStore } from "../state/automation-store.js";
import { selectAutomaticRange, automaticProviderReady, isAutomaticResultUsable } from "./automation-policy.js";
import { automationError, sourceSignature, visibilitySignature } from "./automation-host-adapter.js";
import { hashMessageRange } from "./segment-hash-service.js";

function permission(config) {
    return JSON.stringify([config.mode, config.batchSize, config.keepRecent, config.hideAfterApprove,
        config.paused, config.pending?.id || null, config.journal?.taskId || null, config.journal?.phase || null]);
}

async function verifyApprovedSources(store, messages) {
    for (const range of store.approvedRanges || []) {
        const source = messages.slice(range.startMes, range.endMes + 1);
        if (source.length !== range.endMes - range.startMes + 1 || range.changed ||
            ![undefined, 1, 2].includes(range.hashVersion) ||
            await hashMessageRange(source, range.hashVersion || 1) !== range.sourceHash) throw automationError("source-changed");
    }
}

export function createAutomationActions({ host, getStore, getSettings, generate,
    syncInjection = async () => ({ ready: false }), canInject = () => ({ ready: false }), isEditing = () => false }) {
    const currentState = () => ensureAutomation(getStore(), host.identity()?.key || "");
    const saveState = (target) => {
        const expected = summarySnapshot(getStore());
        const expectedState = JSON.stringify(getStore().automation);
        return host.save(target, saved => sameSummary(saved.store, expected) &&
            JSON.stringify(saved.store.automation) === expectedState);
    };

    async function saveTerminalPhase(target, journal, phase, fallback) {
        journal.phase = phase;
        currentState().status = phase;
        try { await saveState(target); }
        catch (error) {
            journal.phase = fallback;
            Object.assign(currentState(), { paused: true, status: "paused", reason: "save-unconfirmed" });
            throw error;
        }
    }

    async function validateDraft(target, draft, before) {
        host.assertCurrent(target);
        const messages = host.context().chat.slice(draft.range.startMes, draft.range.endMes + 1);
        const signature = sourceSignature(messages);
        if (draft.visibilitySignature && visibilitySignature(messages) !== draft.visibilitySignature) throw automationError("hidden-source");
        if (draft.chatKey !== target.key || messages.length !== draft.range.endMes - draft.range.startMes + 1 ||
            await hashMessageRange(messages, draft.hashVersion || 1) !== draft.sourceHash) throw automationError("source-changed");
        host.assertCurrent(target);
        if (signature !== sourceSignature(host.context().chat.slice(draft.range.startMes, draft.range.endMes + 1))) {
            throw automationError("source-changed");
        }
        if (!sameSummary(getStore(), before) || isEditing()) throw automationError("summary-changed");
        if (host.busy()) throw automationError("busy");
    }

    async function finish(target, journal, assertValid = () => {}) {
        const config = currentState();
        if (config.hideAfterApprove && config.mode === "auto-approve") {
            const { startMes, endMes } = journal.range;
            const messages = host.context().chat;
            if (endMes >= messages.length - config.keepRecent ||
                await hashMessageRange(messages.slice(startMes, endMes + 1)) !== journal.sourceHash) {
                throw automationError("source-changed");
            }
            host.assertCurrent(target);
            if (host.busy() || config.paused) throw automationError("busy");
            const projected = messages.map((message, index) => index >= startMes && index <= endMes
                ? { ...message, is_system: true } : message);
            const readiness = canInject({ messages: projected, ranges: getStore().approvedRanges });
            if (!readiness.ready) throw automationError(readiness.reason || "injection-unavailable");
            journal.hiddenIndexes = messages.flatMap((m, index) => index >= startMes && index <= endMes && !m.is_system ? [index] : []);
            journal.phase = "hiding";
            config.status = "hiding";
            // Persist intent before changing visibility so reload can distinguish interrupted hiding.
            await saveState(target);
            try {
                assertValid();
                host.assertCurrent(target);
                if (host.busy() || config.paused) throw automationError("busy");
                await host.hide(target, journal.hiddenIndexes, true);
                const status = await syncInjection();
                if (!status?.ready) throw automationError(status?.reason || "injection-unavailable");
                await host.save(target, saved => sameSummary(saved.store, journal.after) &&
                    journal.hiddenIndexes.every(index => saved.messages[index]?.is_system === true));
            } catch (error) {
                if (host.identity()?.key === target.key) {
                    journal.phase = "restoring";
                    config.paused = true;
                    // Keep the saved summary even when restoring original visibility fails.
                    await host.hide(target, journal.hiddenIndexes, false);
                    await host.save(target, saved => journal.hiddenIndexes.every(index => saved.messages[index]?.is_system !== true));
                    journal.hiddenIndexes = [];
                    journal.phase = "saved";
                    await syncInjection();
                }
                throw error;
            }
        }
        await saveTerminalPhase(target, journal, "completed", journal.hiddenIndexes.length ? "hiding" : "saved");
    }

    async function commit(target, draft, before, assertValid = () => {}) {
        await validateDraft(target, draft, before);
        const remote = await host.read(target);
        host.assertCurrent(target);
        if (!sameSummary(remote.store, before) || sourceSignature(remote.messages) !== sourceSignature(host.context().chat)) {
            throw automationError("stale-tab");
        }
        await verifyApprovedSources(getStore(), host.context().chat);
        await validateDraft(target, draft, before);
        assertValid();
        const store = getStore();
        const config = currentState();
        const taskId = draft.id;
        if (store.approvedRanges?.some(r => r.startMes <= draft.range.endMes && r.endMes >= draft.range.startMes)) {
            throw automationError("range-overlap");
        }
        config.journal = { taskId, ownerChatKey: target.key, phase: "committing", before,
            draft: compactDraft(draft),
            range: structuredClone(draft.range), sourceHash: draft.sourceHash, hashVersion: draft.hashVersion,
            hiddenIndexes: [], createdAt: Date.now() };
        appendSummaryToStore(store, draft, taskId);
        config.journal.after = summarySnapshot(store);
        config.pending = null;
        config.status = "committing";
        await saveState(target);
        host.assertCurrent(target);
        config.journal.phase = "saved";
        await syncInjection();
        return config.journal;
    }

    async function processRange({ target, store, config, snapshot, range, settings, signal, assertValid, setStage }) {
        const settingsSignature = JSON.stringify(settings);
        const configSignature = permission(config);
        const sourceVisibility = visibilitySignature(host.context().chat.slice(range.startMes, range.endMes + 1));
        const draft = await generate({ ...range, settings, signal, automatic: true });
        draft.visibilitySignature = sourceVisibility;
        assertValid();
        config.pending = compactDraft(draft);
        config.reason = "";
        await validateDraft(target, draft, snapshot);
        assertValid();
        if (settingsSignature !== JSON.stringify(getSettings()) || configSignature !== permission({ ...config, pending: null })) {
            throw automationError("settings-changed");
        }
        if (config.mode === "draft" || !isAutomaticResultUsable(draft)) {
            setStage("committing");
            config.status = "awaiting-review";
            if (!isAutomaticResultUsable(draft)) { config.paused = true; config.reason = "result-needs-review"; }
            await saveState(target);
            return;
        }
        const guard = () => {
            assertValid();
            if (settingsSignature !== JSON.stringify(getSettings()) || configSignature !== permission({ ...config, pending: null })) {
                throw automationError("settings-changed");
            }
        };
        setStage("committing");
        const journal = await commit(target, draft, snapshot, guard);
        // The journal itself changes the permission signature after adoption.
        await finish(target, journal, assertValid);
    }

    async function recover(target) {
        host.assertCurrent(target);
        const config = currentState();
        const journal = config.journal;
        if (!journal || ["completed", "undone", "invalidated"].includes(journal.phase)) return;
        const remote = await host.read(target);
        host.assertCurrent(target);
        if (journal.ownerChatKey !== target.key || !journal.after) throw automationError("save-unconfirmed");
        if (["undoing", "originals-restored"].includes(journal.phase) && sameSummary(remote.store, journal.before) &&
            sameSummary(getStore(), journal.before) && journal.hiddenIndexes.every(i => remote.messages[i]?.is_system !== true)) {
            config.paused = true;
            await syncInjection();
            await saveTerminalPhase(target, journal, "undone", "originals-restored");
            return;
        }
        if (sameSummary(remote.store, journal.before) && journal.phase === "committing" &&
            sourceSignature(remote.messages) === sourceSignature(host.context().chat)) {
            Object.assign(getStore(), structuredClone(journal.before));
            config.pending = journal.draft;
            journal.phase = "invalidated";
            config.paused = true;
            config.status = "awaiting-review";
            config.reason = "save-unconfirmed";
            await saveState(target);
            return;
        }
        const undoPending = ["undoing", "originals-restored"].includes(journal.phase);
        if ((!sameSummary(getStore(), journal.after) && !(undoPending && sameSummary(getStore(), journal.before))) ||
            !sameSummary(remote.store, journal.after)) {
            throw automationError("save-unconfirmed");
        }
        // Never hide additional messages during recovery. Reconcile any interrupted hide by restoring originals.
        if (["hiding", "restoring", "undoing", "originals-restored"].includes(journal.phase)) {
            await validateDraft(target, { ...journal, chatKey: target.key }, summarySnapshot(getStore()));
            await host.hide(target, journal.hiddenIndexes, false);
            await host.save(target, saved => journal.hiddenIndexes.every(index => saved.messages[index]?.is_system !== true));
            if (["undoing", "originals-restored"].includes(journal.phase)) {
                Object.assign(getStore(), structuredClone(journal.before));
                config.paused = true;
                config.reason = "";
                await syncInjection();
                await saveTerminalPhase(target, journal, "undone", "originals-restored");
                return;
            }
            journal.hiddenIndexes = [];
        }
        config.paused = true;
        config.reason = "recovered";
        await syncInjection();
        await saveTerminalPhase(target, journal, "completed", "saved");
    }

    async function undo(target) {
        const config = currentState(), journal = config.journal;
        if (!journal || journal.phase !== "completed") throw automationError("undo-unavailable");
        await validateDraft(target, { ...journal, chatKey: target.key }, journal.after);
        const remote = await host.read(target);
        host.assertCurrent(target);
        if (!sameSummary(remote.store, journal.after) ||
            journal.hiddenIndexes.some(index => host.context().chat[index]?.is_system !== true || remote.messages[index]?.is_system !== true)) {
            throw automationError("undo-conflict");
        }
        journal.phase = "undoing";
        config.paused = true;
        await saveState(target);
        await host.hide(target, journal.hiddenIndexes, false);
        await host.save(target, saved => sameSummary(saved.store, journal.after) &&
            journal.hiddenIndexes.every(index => saved.messages[index]?.is_system !== true));
        journal.phase = "originals-restored";
        await saveState(target);
        Object.assign(getStore(), structuredClone(journal.before));
        config.reason = "";
        await syncInjection();
        await saveTerminalPhase(target, journal, "undone", "originals-restored");
    }

    async function acceptPending(target) {
        const config = currentState(), draft = config.pending;
        if (!draft) throw automationError("draft-unavailable");
        const journal = await commit(target, draft, summarySnapshot(getStore()));
        // A human approval from the workspace never opts into hiding.
        config.paused = true;
        config.reason = "manual-operation";
        await saveTerminalPhase(target, journal, "completed", "saved");
        return { range: draft.range, cumulativeSummary: getStore().cumulativeSummary };
    }

    return { processRange, recover, saveState, validateDraft, commit, finish, undo, acceptPending };
}

export function createAutomationService({ host, getStore, getSettings, hasDraft = () => false,
    isEditing = () => false, onChange = () => {}, processRange, ignoreSymbol, actions }) {
    let epoch = 0;
    let timer = null;
    let controller = null;
    let active = null;
    let stage = "idle";
    let manualBusy = false;
    let lastTrigger = "";
    const state = () => ensureAutomation(getStore(), host.identity()?.key || "");
    const notify = () => onChange();

    function cancel() {
        epoch++;
        clearTimeout(timer);
        timer = null;
        controller?.abort();
    }

    async function execute() {
        const target = host.identity();
        if (!target || active || manualBusy || host.busy() || isEditing()) return;
        const config = state();
        if (config.mode === "manual" || config.paused || config.pending || hasDraft() ||
            (config.journal && !["completed", "undone", "invalidated"].includes(config.journal.phase))) return;
        if (config.schemaVersion !== 1) return;
        const reason = !host.capable() ? "capability-unavailable" : automaticProviderReady(getSettings());
        if (reason) { config.paused = true; config.reason = reason; notify(); return; }
        const localEpoch = epoch;
        controller = new AbortController();
        const signal = controller.signal;
        stage = "generating";
        config.status = "generating";
        notify();
        try {
            await host.lock(target, async () => {
                const store = getStore();
                const snapshot = summarySnapshot(store);
                const remote = await host.read(target);
                host.assertCurrent(target);
                signal.throwIfAborted();
                if (!sameSummary(remote.store, snapshot) || sourceSignature(remote.messages) !== sourceSignature(host.context().chat)) {
                    throw automationError("stale-tab");
                }
                if (permission(ensureAutomation(remote.store, target.key)) !== permission(config)) throw automationError("stale-tab");
                await verifyApprovedSources(store, host.context().chat);
                host.assertCurrent(target);
                signal.throwIfAborted();
                const selected = selectAutomaticRange(host.context().chat, store.approvedRanges || [], config, ignoreSymbol);
                if (!selected.range) {
                    if (selected.reason !== "waiting") throw automationError(selected.reason);
                    config.status = "waiting";
                    return;
                }
                const assertValid = () => {
                    host.assertCurrent(target);
                    signal.throwIfAborted();
                    if (localEpoch !== epoch || config.paused || config.mode === "manual") throw automationError("cancelled");
                };
                await processRange({ target, store, config, snapshot, range: selected.range,
                    settings: structuredClone(getSettings()), signal, assertValid,
                    setStage: value => { stage = value; config.status = value; notify(); } });
            });
        } catch (error) {
            if (host.identity()?.key === target.key) {
                config.paused = true;
                config.reason = error.code || (signal.aborted ? "cancelled" : "generation-failed");
                config.status = "paused";
                if (!host.busy() && (!config.journal || ["completed", "undone", "invalidated"].includes(config.journal.phase)) &&
                    !["another-tab", "stale-tab", "read-failed", "save-unconfirmed"].includes(config.reason)) {
                    try {
                        await host.lock(target, async () => {
                            const saved = await host.read(target);
                            host.assertCurrent(target);
                            if (!sameSummary(saved.store, summarySnapshot(getStore())) ||
                                sourceSignature(saved.messages) !== sourceSignature(host.context().chat) ||
                                (saved.store.automation?.pending && saved.store.automation.pending.id !== config.pending?.id)) {
                                throw automationError("stale-tab");
                            }
                            await actions?.saveState(target);
                        });
                    } catch (failure) { config.reason = failure.code || "save-unconfirmed"; }
                }
            }
        } finally {
            controller = null;
            stage = "idle";
            notify();
        }
    }

    function run() {
        if (active) return active;
        active = execute().finally(() => { active = null; });
        return active;
    }

    return {
        state, run, cancel,
        actions, host,
        get busy() { return stage !== "idle" || manualBusy; },
        get committing() { return stage === "committing" || stage === "hiding"; },
        schedule(trigger) {
            if (trigger && trigger === lastTrigger) return;
            if (trigger) lastTrigger = trigger;
            clearTimeout(timer);
            const scheduledEpoch = epoch;
            const check = () => {
                timer = null;
                if (scheduledEpoch !== epoch) return;
                if (host.busy()) timer = setTimeout(check, 350);
                else void run();
            };
            timer = setTimeout(check, 350);
        },
        chatChanged() { cancel(); lastTrigger = ""; notify(); },
        dispose() { cancel(); },
        async manual(action, { invalidate = false, recovery = false } = {}) {
            if (this.committing || manualBusy) throw automationError("busy");
            const target = host.identity();
            if (!target) throw automationError("chat-changed");
            manualBusy = true;
            try {
                cancel();
                if (active) await active;
                host.assertCurrent(target);
                const invoke = async () => {
                    const config = state();
                    const remote = host.capable() ? await host.read(target) : null;
                    host.assertCurrent(target);
                    if (!recovery && remote && (!sameSummary(remote.store, summarySnapshot(getStore())) ||
                        sourceSignature(remote.messages) !== sourceSignature(host.context().chat) ||
                        remote.store.automation?.pending?.id !== config.pending?.id ||
                        remote.store.automation?.journal?.taskId !== config.journal?.taskId)) throw automationError("stale-tab");
                    if (config.mode !== "manual") { config.paused = true; config.reason = "manual-operation"; }
                    if (!recovery && config.journal && !["completed", "undone", "invalidated"].includes(config.journal.phase)) {
                        throw automationError("recovery-required");
                    }
                    const previousJournal = config.journal;
                    const result = await action(target);
                    host.assertCurrent(target);
                    if (invalidate && config.journal === previousJournal && config.journal?.phase === "completed") config.journal.phase = "invalidated";
                    if (host.capable()) await actions?.saveState(target);
                    return result;
                };
                return host.capable() ? await host.lock(target, invoke) : await invoke();
            } finally { manualBusy = false; notify(); }
        },
    };
}

let runtime = null;
export function setAutomationRuntime(service) { runtime = service; }
export function getAutomationRuntime() { return runtime; }
export function withManualOperation(action, options) { return runtime ? runtime.manual(action, options) : action(); }
