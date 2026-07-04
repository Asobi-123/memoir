# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-07-04

### Added

- **Fusion prompt save/reset** - The Fusion Prompt settings card now has its own `Save Edits` and `Restore Default` buttons, matching the mature-content and fanfic patch cards. Editing the fusion system prompt or user template can be saved directly from the card, and the built-in defaults can be restored in one click without touching the global save button.

## [1.1.1] - 2026-06-20

### Fixed

- **Mobile panel layering** - The floating panel now opens through the browser's native `dialog.showModal()` top layer instead of relying on a fixed-position overlay and z-index. This prevents SillyTavern mobile UI or third-party stacking contexts from covering the Memoir panel.
- **Tablet viewport fit** - The panel now uses dynamic viewport height (`dvh`), safe-area-aware padding, and constrained-height layout rules so tablet browsers with visible address bars do not cut off the panel header or controls.

## [1.1.0] - 2026-06-04

### Added

- **Mature content archive compatibility** - Added an editable mature-content archive compatibility patch, enabled by default, to keep fictional narrative summaries stable when source text contains high-intensity violence, intimate/reproductive actions, or physiological descriptions. Users can edit, reset, or disable this patch from Settings.
- **Empty-response recovery** - Added automatic retry handling for summary generation and Merge & Compress when the provider returns empty content or a filter-like empty result.
- **Manual preservation fallback** - Added a final Merge & Compress fallback that preserves the selected original summaries as manual-revision text if the provider still returns no usable merged output.
- **Visible recovery status** - Added summary and fusion status messages so users can see when Memoir retried a request or preserved content through a fallback path.

### Changed

- **Panel close behavior** - The floating panel no longer closes from a backdrop click or a second launcher click. Use the close button when you intentionally want to close the panel.
- **Panel theme isolation** - Memoir's floating panel now uses plugin-owned theme variables instead of SillyTavern native theme variables, improving readability across both light and dark Memoir panel themes.
- **Summary status display** - The Summary tab status range display now uses quieter text and badges, with changed ranges highlighted more clearly.

## [1.0.2] - 2026-04-05

### Changed

- **Workspace copy clarified** - The floor-range fields in the Workspace tab now use more natural wording and include a short explanation that "floor" means chat message order, reducing confusion for first-time users.
- **Mobile launcher default placement** - The floating trigger now uses a mobile-specific initial position strategy based on the top bar and safe-area inset instead of relying only on a fixed bottom offset, reducing first-load drift on narrow screens.

## [1.0.1] - 2026-04-04

### Fixed

- **Summary generation in non-secure browser contexts** - Memoir no longer hard-fails on `Cannot read properties of undefined (reading 'digest')` when `crypto.subtle` is unavailable under some HTTP / non-secure SillyTavern deployments. Message range hashing now falls back to a pure JavaScript SHA-256 implementation so summary generation and changed-range tracking still work.

## [1.0.0] - 2026-04-04

First public release.

### Added

- Manual segment summarization workflow with floor range selection, draft preview, human review, confirm/discard, and approved-range tracking.
- Relative injection strategy controls for prompt layer, layer depth, message role, and optional wrapper tags.
- Merge & Compress flow for consolidating approved summaries without deleting source chat messages.
- Shared API and independent OpenAI-compatible API modes, including model list fetching from `/v1/models`.
- Built-in original story archive prompt assets with editable presets, style patches, fanfic patching, and custom prompt profiles.
- Floating panel UI with fullscreen text editing, summary search, theme switching, mobile-friendly layout, and bilingual i18n.

### Changed

- Simplified the summary token UI for the 1.0.0 release so the Summary tab focuses on current summary length instead of budget-style warning concepts.
- Reframed injection controls as a relative strategy rather than an absolute insertion point, clarifying same-depth ordering behavior inside SillyTavern.
