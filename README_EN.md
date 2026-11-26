# Memoir

[中文](README.md) · **v1.4.0**

A SillyTavern extension for **controllable chat memory management**. Keep the default manual review flow, or opt each chat into automatic draft generation or adoption. Context injection and summary fusion help later replies continue established story events.

> "古法 Memoir" — your memory, your control. No black boxes, no sneaky chat deletion.

---

## Default Semi-automatic Flow

```
Select a floor range
       ↓
LLM generates a story archive summary
       ↓
You preview, then confirm
       ↓
Confirmed summaries auto-inject into conversation context
       ↓
AI "remembers" past plot on its next reply
```

---

## Features

- **Manual segment summarization** — You choose the range, you confirm. No automatic chat deletion.
- **Optional automation** — Enable draft generation or automatic adoption for this chat, with configurable batch size and recent messages to retain. Hiding is a separate opt-in. Pause and undo the last automatic adoption; new chats remain semi-automatic.
- **Summary presets + style/fanfic/mature-content compatibility templates** — Built-in story archive preset with stackable style templates, fanfic AU compatibility, and a mature-content archive compatibility patch. All template text is fully viewable and editable, and you can swap in your own preferred summary template.
- **Empty-response recovery** — Summary generation and Merge & Compress automatically retry when the provider returns an empty response. If no usable result is returned, Memoir keeps editable fallback text instead of interrupting the workflow.
- **Merge & Compress** — Too many summaries piling up? One-click fusion to deduplicate and consolidate. If the provider keeps returning empty output, Memoir preserves the selected source summaries as manual-revision text.
- **Relative injection strategy** — Choose a prompt layer (top / character / chat injection), layer depth, role, and custom wrapper tags. The character layer is disabled when the active preset cannot support it. Chat-layer injection can automatically sit between summarized, hidden history and the remaining visible chat, updating as messages are added, hidden, or unhidden.
- **Shared / Independent API** — Use SillyTavern's configured API or set up a dedicated summarization API.
- **Fetch Models** — One-click model list retrieval for independent API.
- **Fullscreen editing** — Long prompts and summary text support fullscreen editing; summary fullscreen includes search.
- **Theme switching** — 7 built-in panel themes, launcher color follows theme. Panel colors are isolated from SillyTavern's native theme variables for readable light and dark Memoir themes.
- **Safe panel closing** — Backdrop clicks and second launcher clicks no longer close the panel, preventing accidental content loss during summarization or editing.
- **Mobile responsive** — Panel, fullscreen, and search bar all adapt to small screens, and the launcher avoids awkward first-load placement on mobile.
- **Bilingual i18n** — Chinese / English, auto-detected.

---

## Installation

**Option 1** — Install from SillyTavern UI (recommended):

1. Open **Extensions** → **Install Extension**
2. Enter: `https://github.com/Asobi-123/memoir`
3. Refresh the page

**Option 2** — Manual install:

```bash
cd SillyTavern/data/default-user/extensions/
git clone https://github.com/Asobi-123/memoir.git
```

Refresh SillyTavern to start using.

### Upgrading to 1.4.0

Update the existing Memoir extension directory, or overwrite matching plugin files. There is no need to uninstall the old copy or install a second one. Docker users should update the actual mounted `data/<user>/extensions/memoir/` directory.

Keep SillyTavern settings and chat files. API and prompt configuration live in extension settings; cumulative summaries and covered ranges live in each chat. Replacing plugin files does not clear this data. New chats and chats that have never enabled automation remain semi-automatic. Chats that already opted in retain their rules.

Refresh the SillyTavern browser tab after upgrading. Select **Usage guide** next to the **Automation** heading in Settings for trigger, editing, visibility and undo rules.

---

## Usage

1. Tap the **floating ball** (bottom right) to open the panel, or click "Open Panel" in extension settings.
2. **Workspace**: Set floor range → Generate Summary → Preview → Confirm
   Here, "floor" simply means chat message order: the first message is 1, the second is 2.
3. **Summaries**: View status, adjust injection strategy, edit/merge confirmed summaries
4. **Settings**: Choose automation for this chat, open its usage guide, and configure the theme, API, summary presets and templates

### Prompt Customization

- You can paste in your own preferred summary prompt template.
- The `Mature Content Archive Compatibility Patch` is enabled by default, and can be edited, reset, or disabled.
- The `System Prompt` has no required variables.
- In the `Summary User Template`, keep `{{start_floor}}`, `{{end_floor}}`, and `{{chat_history}}`. Everything else can be changed.

---

### Optional Automation

Open **Settings → Automation**, choose this chat's mode, set a batch size and recent-message reserve, then save to check one batch. Future complete character replies schedule another check once the host is idle. Each message counts as one floor: with a batch of 20 and reserve of 10, floors 1–20 become eligible at 30 messages, then 21–40 at 50.

The **Usage guide** button beside the heading opens the full instructions without changing rules or starting a summary. Each trigger processes at most one batch. If you enable automation with 65 messages already present, it first handles floors 1–20; “Completed” refers to that batch. The next complete character reply checks floors 21–40, always respecting the recent-message reserve.

Draft mode waits for your review and preserves its pending result across reloads. Automatic adoption saves usable results without review. Hiding is a separate opt-in and never deletes source text. The workspace offers pause/resume, interrupted-operation reconciliation and conditional undo of the last automatic adoption. Discarding a draft or performing manual edits pauses automation; later edits can invalidate undo.

After saving edits or a fusion result, select **Resume and check one batch** in the workspace. New summaries append to the edited cumulative text without restarting from floor 1. Preserve range headings when editing; fusion uses them to identify covered history.

Automatic generation uses saved prompt/template settings and currently requires an independent API. The shared API remains available for semi-automatic generation, but its global cancellation and temporary parameters cannot safely isolate background work. The Memoir panel may be closed; keep the SillyTavern browser tab running and use a browser with Web Locks, generally on HTTPS or localhost.

Fallback content, changed sources and unconfirmed saves do not authorize automatic hiding. Injection must also be enabled and compatible. Switching back to semi-automatic does not undo existing summaries or unhide messages. Same-origin tabs coordinate through browser locks; other devices and arbitrary external writers are outside that coordination.

## Related Docs

- **Changelog** — [CHANGELOG.md](CHANGELOG.md)
- **Troubleshooting** — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Manual Testing Checklist** — [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md)
- **Architecture** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Data Model** — [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

---

## License

[AGPL-3.0](LICENSE)
