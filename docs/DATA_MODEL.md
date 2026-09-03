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
  "changed": false,
  "approvedAt": 0
}
```

## Draft Shape (runtime only, not persisted)

Drafts are provider outputs that have not been approved yet.

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
