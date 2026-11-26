/**
 * Self-contained i18n for Chat Compactor.
 * Loads its own translation files — no namespace collision with other extensions.
 */

let translations = {};

export async function initializeI18n() {
    const locale = detectLocale();
    try {
        const url = new URL(`../i18n/${locale}.json`, import.meta.url);
        const resp = await fetch(url);
        if (resp.ok) {
            translations = await resp.json();
        }
    } catch {
        // Fallback: no translations loaded, t() returns raw keys
    }
}

function detectLocale() {
    const lang = (document.documentElement.lang || navigator.language || "").toLowerCase();
    if (lang.startsWith("zh")) {
        return "zh-cn";
    }
    return "en-us";
}

/**
 * Translate a key. Returns the key itself if no translation found.
 */
export function t(key, replacements) {
    const text = translations[key] ?? key;
    if (!replacements) {
        return text;
    }
    let result = text;
    for (const [k, v] of Object.entries(replacements)) {
        result = result.replaceAll(`{${k}}`, String(v));
    }
    return result;
}

export function translateOperationError(error) {
    const key = `automation.reason.${error.code || error.message}`;
    const translated = t(key);
    return translated === key ? error.message : translated;
}
