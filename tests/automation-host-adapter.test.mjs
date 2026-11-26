import { test } from "node:test";
import assert from "node:assert/strict";
import { createAutomationHost, getChatIdentity, sourceSignature } from "../src/services/automation-host-adapter.js";

function fixture() {
    let context = { chatId: "file", characterId: 0, characters: [{ name: "A", avatar: "a.png" }],
        getRequestHeaders: () => ({}), saveChat: async () => {} };
    const calls = [];
    const host = createAutomationHost({ getContext: () => context, isGenerating: () => false,
        hideRange: async (...args) => calls.push(args),
        locks: { request: async (_, options, fn) => fn({}) },
        fetcher: async (url, options) => {
            calls.push({ url, body: JSON.parse(options.body) });
            return { ok: true, json: async () => [{ chat_metadata: { extensions: { chat_compactor: { task: 1 } } } }] };
        },
    });
    return { host, calls, context, switch: () => { context = { ...context, chatId: "other" }; } };
}

test("identity includes owner, kind and chat file; temporary chats have no identity", () => {
    const { context } = fixture();
    assert.notEqual(getChatIdentity(context).key, getChatIdentity({ ...context, chatId: "other" }).key);
    assert.notEqual(getChatIdentity(context).key, getChatIdentity({ ...context, groupId: "g" }).key);
    assert.equal(getChatIdentity({}), null);
});
test("single and group readback address captured files", async () => {
    const { host, context, calls } = fixture();
    await host.read(host.identity());
    context.groupId = "group";
    await host.read(host.identity());
    assert.deepEqual(calls.map(c => c.body), [
        { ch_name: "A", file_name: "file", avatar_url: "a.png" }, { id: "file" },
    ]);
});
test("a resolved saver cannot pass a failed readback predicate", async () => {
    const { host } = fixture();
    await assert.rejects(host.save(host.identity(), () => false), { code: "save-unconfirmed" });
    await host.save(host.identity(), data => data.store.task === 1);
});
test("switch during saving blocks completion", async () => {
    const f = fixture();
    f.context.saveChat = async () => f.switch();
    await assert.rejects(f.host.save(f.host.identity(), () => true), { code: "chat-changed" });
});
test("native visibility is batched without extending the selected indexes", async () => {
    const { host, calls } = fixture();
    await host.hide(host.identity(), [0, 1, 4], true);
    assert.deepEqual(calls, [[0, 1, false], [4, 4, false]]);
});
test("lack of atomic browser lock fails closed", async () => {
    const host = createAutomationHost({ getContext: () => ({}), locks: null });
    assert.equal(host.capable(), false);
    await assert.rejects(host.lock({}, () => {}), { code: "locks-unavailable" });
});

test("host initialization of the original swipe is not a stale-tab conflict", () => {
    const source = [{ name: "A", mes: "text" }];
    assert.equal(sourceSignature(source), sourceSignature([{ ...source[0], swipe_id: 0 }]));
    assert.notEqual(sourceSignature(source), sourceSignature([{ ...source[0], swipe_id: 1 }]));
});
