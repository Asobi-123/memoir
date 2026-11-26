# Data Model

## Extension Settings

Stored in:

- `extension_settings.chat_compactor`

Current shape:

```json
{
  "summaryGenerationMode": "shared-api",
  "independentApiConfig": {
    "model": "",
    "apiUrl": "",
    "apiKey": ""
  },
  "apiProfiles": [],
  "currentApiProfileId": "",
  "customPromptProfiles": [],
  "promptProfileId": "main-archive",
  "stylePatchId": "none",
  "fanficPatchEnabled": false,
  "contentCompatibilityPatchEnabled": true,
  "contentCompatibilityPatchText": "",
  "summaryEmptyRetryEnabled": true,
  "summaryResponseLength": 0,
  "fusionResponseLength": 0,
  "autoInjectApproved": true,
  "injectionPosition": 0,
  "injectionDepthMode": "manual",
  "injectionDepth": 1,
  "injectionRole": 0,
  "injectionWrapTag": "",
  "defaultRangeSize": 20,
  "summaryFilterFragments": [],
  "fusionSystemPrompt": "...",
  "fusionUserTemplate": "..."
}
```

`injectionDepthMode` is either `manual` or `auto`. Automatic mode only applies to
the Chat Injection Layer. It derives the effective depth from a continuous hidden
history prefix that is fully covered by the approved summary ranges; the stored
`injectionDepth` remains the manual fallback value.

## Chat Store

Stored in:

- `chat_metadata.extensions.chat_compactor`

Current shape:

```json
{
  "version": 1,
  "approvedRanges": [],
  "approvedBaselineRanges": [],
  "cumulativeSummary": "",
  "approvedBaselineSummary": ""
}
```

## API Profile Shape

Stored inside:

- `extension_settings.chat_compactor.apiProfiles`

```json
{
  "id": "profile_...",
  "name": "My API Profile",
  "apiUrl": "",
  "apiKey": "",
  "model": "",
  "summaryGenerationMode": "independent-api"
}
```

## Approved Range Shape

Each entry in `approvedRanges`:

```json
{
  "id": "range_...",
  "index": 1,
  "title": "【第1次总结】(楼 1-20)",
  "startMes": 0,
  "endMes": 19,
  "sourceHash": "sha256...",
  "hashVersion": 2,
  "taskId": null,
  "changed": false,
  "approvedAt": 0
}
```

## Draft Shape

Drafts are provider outputs that have not been approved yet. Manual drafts are runtime-only and carry a stable `chatKey`. Automatic drafts persist a compact subset under the chat's automation state; API requests, credentials and raw source-message copies are not persisted there.

```json
{
  "id": "draft_...",
  "range": {
    "startMes": 0,
    "endMes": 19,
    "startFloor": 1,
    "endFloor": 20
  },
  "sourceHash": "sha256...",
  "request": {},
  "response": {},
  "status": "draft",
  "promptProfileId": "main-archive",
  "stylePatchId": "none",
  "fanficPatchEnabled": false,
  "contentCompatibilityPatchEnabled": true,
  "providerInfo": {
    "requestedMode": "shared-api",
    "resolvedMode": "shared-api",
    "fallbackUsed": false,
    "fallbackReason": "",
    "emptyRetryUsed": false,
    "emptyRetryReason": "",
    "localFallbackUsed": false,
    "localFallbackReason": "",
    "model": ""
  },
  "createdAt": 0
}
```

`providerInfo.model` only shows the model name returned or used by the resolved provider path. It is no longer filled with the independent model name when the actual resolved mode is `shared-api`.

## Custom Prompt Profile Shape

Stored inside:

- `extension_settings.chat_compactor.customPromptProfiles`

```json
{
  "id": "custom-prompt-...",
  "label": "My Prompt",
  "systemPrompt": "...",
  "userTemplate": "...",
  "stylePatchId": "none",
  "fanficPatchEnabled": false,
  "contentCompatibilityPatchEnabled": true
}
```

## Status Values

- `draft`
- `approved`
- `rejected`

## Changed Detection

Approved ranges have a `changed` boolean flag. When source messages are edited and
the hash no longer matches `sourceHash`, the flag is set to `true`. The summary
continues to be usable (soft detection, not hard disable).

Hash version 2 covers message role, speaker, text and selected swipe, excluding visibility. Missing `hashVersion` means the original algorithm, including `is_system`. A legacy record is migrated only when its existing hash verifies; mismatches remain changed rather than being silently re-baselined. Automatic adoption stops for changed or unverified ranges.

## Per-chat Automation

`chat_metadata.extensions.chat_compactor.automation`:

```json
{
  "schemaVersion": 1,
  "ownerChatKey": "[\"character\",\"avatar.png\",\"chat-file\"]",
  "mode": "manual",
  "batchSize": 20,
  "keepRecent": 10,
  "hideAfterApprove": false,
  "paused": false,
  "status": "idle",
  "reason": "",
  "pending": null,
  "journal": null
}
```

Modes are `manual`, `draft` and `auto-approve`. Positive integer batch/reserve values are required. A different owner key (including a copied/branched chat) resets automation permissions and execution records. An unknown schema disables automation without overwriting the unknown record.

`pending` stores the draft ID, owner key, range, hash/version, visibility-only mask, summary text and a small provider-status projection. It contains no request or API configuration. A pending result blocks another automatic batch until reviewed or discarded.

`journal` stores `taskId`, owner, range, source hash/version, compact draft, summary/range snapshots before and after adoption, indexes newly hidden by this transaction, and its phase. The latest journal replaces the previous undo point. Approved ranges carry the matching task ID for idempotency.

Phases include `committing`, `saved`, `hiding`, `restoring`, `completed`, `undoing`, `originals-restored`, `undone` and `invalidated`. Unconfirmed terminal saves retain a nonterminal phase for reconciliation. Recovery never generates a new summary or repeats an append. UI status and a model response alone are not evidence of durable adoption; fixed-target readback confirms it.
