# Troubleshooting

This guide covers the most common setup and runtime issues for Memoir.

## Summary Generation Fails

### Shared API mode

Check that SillyTavern itself can generate a normal chat reply first.

If the main chat API is already failing, Memoir cannot build a summary through the shared path.

### Independent API mode

Memoir's independent mode requires both:

- `API URL`
- `Model`

If either field is empty, Memoir falls back to the shared API path instead of using the independent endpoint.

If both fields are filled and generation still fails:

- Verify the endpoint is OpenAI-compatible.
- Verify the URL points to the API base or `/v1/chat/completions`.
- Verify the API key is valid if the provider requires one.
- Verify the selected model name is accepted by that endpoint.

## Fetch Models Returns Empty

`Fetch Models` requests `GET /v1/models` from the configured API URL.

Check these points:

- The configured URL is reachable from the browser running SillyTavern.
- The provider exposes an OpenAI-compatible `/v1/models` endpoint.
- The API key is correct if the provider requires authentication.
- The server actually returns model IDs in a `data` array or simple list.

If your provider does not support `/v1/models`, you can type the model name manually.

## The Summary Was Confirmed But The AI Still Ignores It

Check these points:

- `Auto Inject Approved` is enabled.
- The current chat already has confirmed summary text.
- The selected injection layer matches your prompt stack expectations.

Also note:

- `Chat Injection Layer` is not an absolute final slot.
- `Layer Depth = 0` only means "try to stay close to the latest message".
- If another extension uses the same layer and depth, SillyTavern still decides final ordering.

If you need more stable behavior, use `Character Layer` instead of `Chat Injection Layer`.

## Character Layer Is Unavailable

Memoir disables `Character Layer` when the active Chat Completion preset does not support that location. Choose `Top Layer` or `Chat Injection Layer`, or switch to a compatible preset. Memoir does not modify third-party presets automatically.

## Automatic Chat Placement Is Unavailable Or Looks Wrong

Automatic chat placement only applies when the beginning of the chat is one continuous hidden range and every message in that range is covered by approved Memoir summaries. If there is a visible gap, a hidden message later in the chat, or incomplete summary coverage, choose a manual depth instead.

SillyTavern `/hide` uses zero-based message indexes while Memoir displays floors starting at 1. To hide Memoir floors 1 through 60, use `/hide 0-59` in SillyTavern.

## Custom Prompt Editing Broke Generation

Memoir lets you rewrite the built-in prompt templates, but the user template still needs these variables:

- `{{start_floor}}`
- `{{end_floor}}`
- `{{chat_history}}`

The system prompt has no required variables.

If generation suddenly becomes empty or unusable after prompt edits, restore the missing variables first.

## Approved Ranges Show As Changed

This means the original source messages no longer match the hash saved at approval time.

Typical causes:

- You edited chat messages after confirming a summary.
- You deleted part of the summarized message range.
- The selected range now points to different message content.

This is a soft warning, not a hard lock. Existing summary injection still works, but the stored summary may no longer match the current chat history.

## Merge & Compress Output Looks Off

Check these points:

- The confirmed summaries already contain the text you want to preserve.
- Your fusion prompt is still aligned with your preferred archive format.
- The configured output length is not too short for the amount of material being merged.

If needed, edit the merged result manually before continuing.

If merge returns empty content:

- Memoir retries once with reinforced recovery prompts.
- If the retry still returns empty content, Memoir preserves the selected original summaries as a manual-revision block instead of deleting them.
- If clicking merge again later succeeds, the provider likely returned an intermittent empty response on the first attempt.
- Refresh the SillyTavern page after updating Memoir, so the browser loads the newest extension files.

## Mobile Or Narrow Panel Feels Crowded

Memoir supports smaller screens, but long prompt editing is more comfortable in fullscreen mode.

If the normal textarea feels cramped:

- Open the fullscreen editor for prompt fields.
- Open the fullscreen summary editor when reviewing long cumulative summaries.

## Before Reporting A Bug

Collect these details:

- Memoir version
- SillyTavern version
- Whether you used shared API or independent API
- The exact steps that reproduce the issue
- The error message shown in the UI, if any
