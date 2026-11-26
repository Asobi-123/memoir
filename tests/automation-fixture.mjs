import { ensureAutomation } from "../src/state/automation-store.js";
import { createAutomationActions } from "../src/services/automation-service.js";
import { hashMessageRange } from "../src/services/segment-hash-service.js";

export async function fixture(overrides = {}) {
    const chat = Array.from({ length: 30 }, (_, i) => ({ name: "A", mes: `source ${i}` }));
    const store = {};
    const state = ensureAutomation(store, "a"); state.mode = "auto-approve";
    let disk = { store: structuredClone(store), messages: structuredClone(chat) };
    let failSave = false;
    const events = [];
    const host = { identity: () => ({ key: "a" }), assertCurrent: () => {}, context: () => ({ chat }),
        busy: () => false, capable: () => true, read: async () => structuredClone(disk),
        lock: async (_, action) => action(),
        save: async (_, verify) => {
            events.push("save");
            if (!failSave) disk = { store: structuredClone(store), messages: structuredClone(chat) };
            if (!verify(disk)) throw Object.assign(new Error("save-unconfirmed"), { code: "save-unconfirmed" });
            return disk;
        },
        hide: async (_, indexes, hidden) => {
            events.push(hidden ? "hide" : "unhide");
            indexes.forEach(index => { chat[index].is_system = hidden; });
            disk = { store: structuredClone(store), messages: structuredClone(chat) };
        },
    };
    const settings = { summaryGenerationMode: "independent-api", independentApiConfig: { apiUrl: "url", model: "model" } };
    const draft = { id: "task-1", chatKey: "a", status: "draft", hashVersion: 2,
        range: { startMes: 0, endMes: 19, startFloor: 1, endFloor: 20 },
        sourceHash: await hashMessageRange(chat.slice(0, 20)), response: { archiveSummary: "The team arrived." }, providerInfo: {} };
    const actions = createAutomationActions({ host, getStore: () => store, getSettings: () => settings,
        generate: async () => structuredClone(draft), syncInjection: async () => ({ ready: true }),
        canInject: () => ({ ready: true }), ...overrides });
    return { chat, store, state, host, events, actions, draft, settings,
        failSave: value => { failSave = value; }, disk: () => disk };
}
