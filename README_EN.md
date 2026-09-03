# Memoir

[中文](README.md)

A SillyTavern extension for **controllable chat memory management** — manual segment summarization, human review, and context injection. Keeps the AI aware of past story events instead of gradually forgetting as the chat grows.

> "古法 Memoir" — your memory, your control. No black boxes, no sneaky chat deletion.

---

## How It Works

```
Select a floor range
       ↓
LLM generates a story archive summary
       ↓
You preview, edit, then confirm
       ↓
Confirmed summaries auto-inject into conversation context
       ↓
AI "remembers" past plot on its next reply
```

---

## Features

- **Manual segment summarization** — You choose the range, you confirm. No automatic chat deletion.
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

---

## Usage

1. Tap the **floating ball** (bottom right) to open the panel, or click "Open Panel" in extension settings.
2. **Workspace**: Set floor range → Generate Summary → Preview → Confirm
   Here, "floor" simply means chat message order: the first message is 1, the second is 2.
3. **Summaries**: View status, adjust injection strategy, edit/merge confirmed summaries
4. **Settings**: Choose theme, configure API, select/edit summary presets, templates, and the mature-content archive compatibility patch

### Prompt Customization

- You can paste in your own preferred summary prompt template.
- The `Mature Content Archive Compatibility Patch` is enabled by default, and can be edited, reset, or disabled.
- The `System Prompt` has no required variables.
- In the `Summary User Template`, keep `{{start_floor}}`, `{{end_floor}}`, and `{{chat_history}}`. Everything else can be changed.

---

## Related Docs

- **Changelog** — [CHANGELOG.md](CHANGELOG.md)
- **Troubleshooting** — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Manual Testing Checklist** — [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md)
- **Architecture** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Data Model** — [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

---

## License

[AGPL-3.0](LICENSE)
