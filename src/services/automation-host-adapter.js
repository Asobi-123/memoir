import { EXTENSION_ID } from "../constants.js";

// Host contracts checked against ST 1.19.0, 06bde939f:
// st-context.js, chats.js hideChatMessageRange, script.js getChat/saveMetadata.
export function getChatIdentity(context) {
    const file = context?.chatId;
    const group = context?.groupId;
    const character = context?.characters?.[context.characterId];
    if (!file || (!group && !character?.avatar)) return null;
    const identity = group
        ? { kind: "group", owner: String(group), file: String(file) }
        : { kind: "character", owner: character.avatar, file: String(file), name: character.name };
    return { ...identity, key: JSON.stringify([identity.kind, identity.owner, identity.file]) };
}

export function automationError(code) {
    return Object.assign(new Error(code), { code });
}

export function sourceSignature(messages) {
    return JSON.stringify((messages || []).map(m => [m.is_user === true, m.is_system === true,
        m.name || "", m.mes || "", m.swipe_id ?? 0, !!m.extra?.[Symbol.for("ignore")]]));
}

export function visibilitySignature(messages) {
    return JSON.stringify((messages || []).map(m => [m.is_system === true, !!m.extra?.[Symbol.for("ignore")]]));
}

export function createAutomationHost({ getContext, isGenerating, hideRange,
    locks = globalThis.navigator?.locks, fetcher = globalThis.fetch } = {}) {
    const identity = () => getChatIdentity(getContext());
    const assertCurrent = (target) => {
        if (!target || identity()?.key !== target.key) throw automationError("chat-changed");
    };

    async function read(target) {
        const response = await fetcher(target.kind === "group" ? "/api/chats/group/get" : "/api/chats/get", {
            method: "POST", cache: "no-store", headers: getContext().getRequestHeaders(),
            body: JSON.stringify(target.kind === "group" ? { id: target.file } : {
                ch_name: target.name, file_name: target.file, avatar_url: target.owner,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw automationError("read-failed");
        const data = await response.json();
        if (!Array.isArray(data) || !data[0]?.chat_metadata) throw automationError("read-failed");
        return { store: data[0].chat_metadata.extensions?.[EXTENSION_ID] || {}, messages: data.slice(1) };
    }

    async function save(target, verify) {
        assertCurrent(target);
        // The native saver can swallow errors. Only a fixed-target readback is evidence.
        await getContext().saveChat();
        const stored = await read(target);
        assertCurrent(target);
        if (!verify(stored)) throw automationError("save-unconfirmed");
        return stored;
    }

    return {
        identity, assertCurrent, read, save,
        context: getContext,
        busy: () => typeof isGenerating !== "function" || isGenerating(),
        capable: () => Boolean(identity() && locks?.request && getContext()?.saveChat &&
            getContext()?.getRequestHeaders && typeof globalThis.AbortSignal?.timeout === "function" &&
            typeof hideRange === "function" && typeof isGenerating === "function"),
        async lock(target, action) {
            if (!locks?.request) throw automationError("locks-unavailable");
            return locks.request(`memoir:${target.key}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
                if (!lock) throw automationError("another-tab");
                assertCurrent(target);
                return action();
            });
        },
        async hide(target, indexes, hidden) {
            assertCurrent(target);
            // Batch adjacent indexes; preserve unrelated pre-existing visibility flags.
            const groups = [];
            for (const index of indexes) {
                const last = groups.at(-1);
                if (last && last[1] + 1 === index) last[1] = index;
                else groups.push([index, index]);
            }
            for (const [start, end] of groups) {
                assertCurrent(target);
                await hideRange(start, end, !hidden);
                assertCurrent(target);
            }
        },
    };
}
