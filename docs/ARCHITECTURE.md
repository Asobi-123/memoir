# Architecture

## Overview

Memoir (古法 Memoir) is a third-party SillyTavern extension that provides controllable chat memory management with human review before any content is injected into the conversation context.

## V1 Flow

1. User selects a floor range in the Workspace tab.
2. Extension builds a prompt bundle (summary preset + style/fanfic/content-compatibility templates).
3. LLM provider generates a summary.
4. User previews the result and confirms or discards.
5. Confirmed summary is appended to cumulative text stored in `chat_metadata`.
6. Cumulative text is injected into the conversation context via `setExtensionPrompt`.
7. On chat changes, confirmed ranges are hash-checked and softly marked if source messages changed.

## Layer Diagram

```
┌─────────────────────────────────────────┐
│  UI Layer (src/ui/)                     │
│  panel.js — floating modal + themes     │
│  settings-ui.js — form binding          │
│  draft-panel.js — workspace logic       │
│  segments-panel.js — summary tab logic  │
│  status-panel.js — status display       │
│  launcher.js — extension menu entry     │
├─────────────────────────────────────────┤
│  Prompt Layer (src/prompts/)            │
│  prompt-registry.js — preset/template   │
│  assets/ — built-in presets & templates │
├─────────────────────────────────────────┤
│  Service Layer (src/services/)          │
│  provider-router.js — API routing       │
│  summary-draft-service.js — generation  │
│  approval-service.js — confirm/discard  │
│  injection-service.js — context inject  │
│  injection-depth-calculator.js           │
│  injection-compatibility.js              │
│  fusion-service.js — merge & compress   │
│  summary-token-service.js — token stats │
│  segment-hash-service.js — SHA-256      │
│  stale-detection-service.js             │
│  range-state-service.js                 │
│  range-suggestion-service.js            │
├─────────────────────────────────────────┤
│  State Layer (src/state/)               │
│  defaults.js — default settings         │
│  settings-store.js — read/write         │
│  chat-segment-store.js — per-chat data  │
├─────────────────────────────────────────┤
│  Core Layer (src/core/)                 │
│  app.js — lifecycle + event handlers    │
│  context.js — safe chat/metadata access │
├─────────────────────────────────────────┤
│  Entry                                  │
│  index.js → bootstrap.js → app.js      │
└─────────────────────────────────────────┘
```

## Key Design Decisions

### Self-contained i18n
Fetches its own locale JSON files instead of using SillyTavern's `context.translate`. Avoids namespace collision with other extensions.

### Native Dialog Modal (not Popup / Drawer)
The floating panel uses a browser-native `<dialog>` opened with `showModal()`, with the Memoir panel rendered inside it. This puts the panel in the browser top layer so SillyTavern mobile UI and third-party stacking contexts cannot cover it. Memoir still does not depend on SillyTavern's Popup API or inline-drawer system.

The dialog handles the backdrop through `::backdrop`. Backdrop clicks and dialog cancel/Escape events are intentionally ignored so drafts and edited text are not lost by an accidental close; the close button is the deliberate close path.

### CSS injected via JS
All panel styles are in `panel.js` as a template literal, injected as a `<style>` element. This keeps `style.css` minimal and avoids SillyTavern's global CSS from interfering.

### Soft stale detection
When source messages are edited after a summary is confirmed, the summary is flagged as "changed" but continues to work. No hard disabling.

### Provider router with fallback
Independent API mode falls back to shared API if config is incomplete. Summary generation and fusion each have their own output-length setting. `0` means "follow SillyTavern's global response length". Shared API omits `responseLength` when set to `0`, while independent API only sends `max_tokens` when the configured value is greater than `0`.

### Relative injection strategy
Memoir uses SillyTavern's extension prompt layer and depth controls as a relative strategy, not an absolute insertion point. Within the same layer and depth, final ordering still follows SillyTavern's prompt assembly rules.

The Character Layer is available only when the active Chat Completion prompt collection supports that host location. When it is unavailable, Memoir clears its injection rather than silently moving it to another layer.

Chat Injection Layer also supports an automatic depth mode. It is valid only when the chat begins with one continuous hidden prefix and that prefix is fully covered by approved Memoir summary ranges. The effective depth is the number of visible messages after that prefix, which places the cumulative summary before the first visible message. Memoir refreshes this state after chat changes and when a message's hidden status changes.

### Summary length display
Confirmed summaries can be measured with SillyTavern's token counter. Memoir now counts only the current cumulative summary text for UI display and editing feedback.

### Prompt presets save patch state
Custom prompt presets store their associated style template, fanfic template, and content-compatibility template selections, so switching presets restores the full configuration.

### Empty-response recovery
Summary generation and fusion append the mature-content archive compatibility patch by default. Turning the setting off only affects the first normal request. If the provider returns empty content or a filter-like failure, Memoir retries once with the compatibility patch forced on plus a stronger recovery prompt. If the retry still produces no usable text, summary generation creates a non-empty local draft, while fusion preserves the original selected summaries as a manual-revision block.
