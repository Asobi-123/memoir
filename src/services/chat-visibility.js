/**
 * Standard /hide marks a message as system; IGNORE_SYMBOL is a separate core
 * exclusion path that also removes a message from the generation context.
 */
export function isMessageExcludedFromContext(message, ignoreSymbol) {
    return message?.is_system === true || Boolean(message?.extra?.[ignoreSymbol]);
}
