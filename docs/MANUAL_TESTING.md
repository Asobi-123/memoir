# Manual Testing Checklist

This checklist is for release validation before publishing a new Memoir version.

## Preconditions

- SillyTavern loads without extension initialization errors.
- At least one test chat has enough messages to summarize.
- Shared API can complete a normal reply, or the independent API endpoint is reachable.
- Test at least one desktop viewport and one narrow/mobile viewport.

## 1. Shared API Summary Generation

Steps:

1. Open a chat with enough history.
2. In `Workspace`, choose a floor range.
3. Generate a summary in shared API mode.
4. Review the draft and confirm it.

Expected:

- A draft is generated for the selected range.
- Confirming the draft appends text into the cumulative summary.
- A new approved range appears in the Summary tab.
- The Workspace copy makes it clear that "floor" means chat message order.

## 2. Independent API Mode

Steps:

1. Switch summary generation to `Independent API`.
2. Fill `API URL`, `Model`, and `API Key` if required.
3. Click `Fetch Models` or type a model manually.
4. Generate a summary.

Expected:

- `Fetch Models` returns a usable list when the endpoint supports `/v1/models`.
- Summary generation succeeds through the independent provider.
- If `API URL` or `Model` is missing, Memoir falls back to shared API instead of hard failing.

## 3. Confirm, Edit, And Reset Summary Text

Steps:

1. Confirm at least one generated draft.
2. Open the Summary tab.
3. Edit the cumulative summary text.
4. Use the reset/restore path if available in your workflow.

Expected:

- Summary text can be edited without breaking the approved ranges list.
- The visible summary length updates after edits.
- Restoring baseline content returns to the last approved state.

## 4. Injection Strategy

Steps:

1. Open the collapsible `Injection Strategy` card.
2. Switch between `Top Layer`, `Character Layer`, and `Chat Injection Layer`.
3. Change `Layer Depth`, `Message Role`, and wrapper tag.

Expected:

- The card stays collapsed by default and can be expanded when needed.
- Changes save correctly and persist after refresh.
- Wrapper tags appear around injected summary text when configured.
- Chat-layer injection behaves as a relative position, not an absolute final slot.

## 5. Merge & Compress

Steps:

1. Confirm multiple summary ranges.
2. Run `Merge & Compress`.
3. Review the merged result.
4. If possible, test with a provider or prompt case that can return empty content.

Expected:

- The merged result combines prior approved content.
- Approved ranges and cumulative summary remain coherent after merge.
- No source chat messages are deleted by the extension.
- Empty or filter-like provider output triggers a visible retry/fallback notice.
- If the provider still returns no usable text, Memoir preserves the selected original summaries as editable manual-revision text.
- The Fusion Prompt card's `Save Edits` button persists edits to the fusion system prompt and user template across reload, and `Restore Default` returns both fields to the built-in defaults and persists that change.

## 6. Mature Content Archive Compatibility

Steps:

1. Open Settings.
2. Verify the mature-content archive compatibility patch is visible and enabled by default.
3. Edit the patch text, save settings, reload, and confirm the edited text persists.
4. Use the reset control and confirm the default patch is restored.
5. Disable the patch, generate a normal summary, then trigger or simulate an empty-response recovery path if possible.

Expected:

- The compatibility patch can be edited, saved, reset, and disabled.
- Disabling the patch affects the first normal request.
- Empty-response recovery can still temporarily force compatibility instructions for the retry path.
- Generated drafts and retry notices remain user-visible and editable.

## 7. Prompt Presets And Custom Templates

Steps:

1. Switch between built-in prompt presets and style patches.
2. Edit the system prompt and user template.
3. Save a custom prompt profile.
4. Reload the page and reopen the extension.

Expected:

- Preset switching restores the associated prompt configuration.
- Custom prompt profiles persist across reload.
- Custom prompt profiles preserve their mature-content compatibility setting.
- The user template still works when `{{start_floor}}`, `{{end_floor}}`, and `{{chat_history}}` are preserved.

## 8. Language And Copy Review

Steps:

1. Open the extension with Chinese UI.
2. Open the extension with English UI.
3. Check Summary and Settings tabs.

Expected:

- Both locales render without missing i18n keys.
- Injection wording matches the agreed "relative injection strategy" terminology.
- Removed budget-style wording does not appear in token or length UI.
- Summary/fusion retry and fallback notices are understandable in both locales.

## 9. Responsive UI

Steps:

1. Open the panel on desktop width.
2. Repeat on a narrow/mobile width.
3. Repeat on a tablet-sized viewport, including a browser with the address bar visible if available.
4. Open fullscreen editors for long text fields.
5. Click outside the panel while a draft or edited text exists.
6. Press Escape or trigger the browser dialog cancel path on desktop.
7. Click the floating launcher again while the panel is open.
8. Close the panel with the close button.

Expected:

- The panel remains usable on both widths.
- On mobile and tablet, the panel appears above SillyTavern UI instead of behind headers, input bars, drawers, or other extension layers.
- Tablet browsers do not cut off the panel header, tabs, or Workspace controls.
- Fullscreen editors open correctly.
- Long summary text remains editable and searchable in fullscreen.
- On mobile, the floating trigger starts in a stable visible position near the top bar instead of drifting too low or off-screen.
- Backdrop clicks do not close the panel.
- Escape/cancel does not close the panel.
- A second launcher click does not close the panel.
- The close button still closes the panel.

## 10. Panel Theme Readability

Steps:

1. Switch through at least one dark Memoir panel theme and one light Memoir panel theme.
2. Check text inputs, textareas, selects, placeholders, focused fields, disabled fields, and select options.
3. Check Summary tab status floor display, including `(none)` and changed ranges.

Expected:

- Form controls remain readable in both dark and light panel themes.
- Memoir panel styling does not depend on SillyTavern native theme variables.
- `(none)` uses subdued text, normal ranges use badges, and changed ranges are visually distinct.

## Release Gate

Before tagging a release:

- `manifest.json` version is `1.1.1`.
- `README.md` and `README_EN.md` point to the correct repository URL.
- `CHANGELOG.md` contains the release entry and date.
- JavaScript syntax check passes.
- Chinese and English i18n key sets match.
- CSS checks show no Memoir panel dependency on SillyTavern native theme variables.
