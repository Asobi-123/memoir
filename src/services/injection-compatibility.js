/**
 * Third-party IN_PROMPT injections in Chat Completion are anchored to `main`.
 */
export function hasCharacterLayerAnchor(mainApi, promptCollection) {
    if (mainApi !== "openai") {
        return true;
    }

    return promptCollection?.has?.("main") === true;
}
