import { extension_settings } from "/scripts/extensions.js";
import { saveSettingsDebounced } from "/script.js";
import { EXTENSION_ID } from "../constants.js";
import { normalizeNonNegativeInteger } from "../utils.js";
import { DEFAULT_SETTINGS } from "./defaults.js";

export function loadSettings() {
    extension_settings[EXTENSION_ID] ||= {};
    const bucket = extension_settings[EXTENSION_ID];

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (bucket[key] === undefined) {
            bucket[key] = structuredClone(value);
        }
    }

    migrateLegacySettings(bucket);

    return bucket;
}

export function getSettings() {
    return loadSettings();
}

export function updateSettings(patch) {
    const settings = loadSettings();
    Object.assign(settings, patch);
    saveSettingsDebounced();
    return settings;
}

export function updateIndependentApiConfig(patch) {
    const settings = loadSettings();
    settings.independentApiConfig = {
        ...settings.independentApiConfig,
        ...patch,
    };
    saveSettingsDebounced();
    return settings;
}

export function isIndependentApiConfigured(settings = loadSettings()) {
    return !!(
        settings.independentApiConfig?.apiUrl?.trim() &&
        settings.independentApiConfig?.model?.trim()
    );
}

export function listApiProfiles() {
    return loadSettings().apiProfiles || [];
}

export function saveCurrentApiProfile(name) {
    const settings = loadSettings();
    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
        throw new Error("Profile name is required.");
    }

    settings.apiProfiles ||= [];
    const existing = settings.apiProfiles.find((profile) => profile.name === trimmedName);
    const snapshot = {
        apiUrl: settings.independentApiConfig.apiUrl || "",
        apiKey: settings.independentApiConfig.apiKey || "",
        model: settings.independentApiConfig.model || "",
        summaryGenerationMode: normalizeApiProfileMode({
            summaryGenerationMode: settings.summaryGenerationMode,
        }),
    };

    if (existing) {
        existing.apiUrl = snapshot.apiUrl;
        existing.apiKey = snapshot.apiKey;
        existing.model = snapshot.model;
        existing.summaryGenerationMode = snapshot.summaryGenerationMode;
        settings.currentApiProfileId = existing.id;
    } else {
        const profile = {
            id: `profile_${Date.now()}`,
            name: trimmedName,
            ...snapshot,
        };
        settings.apiProfiles.push(profile);
        settings.currentApiProfileId = profile.id;
    }

    saveSettingsDebounced();
    return settings.currentApiProfileId;
}

export function saveActiveApiProfile() {
    const settings = loadSettings();
    const currentId = settings.currentApiProfileId;
    if (!currentId) {
        saveSettingsDebounced();
        return null;
    }

    const profile = (settings.apiProfiles || []).find((item) => item.id === currentId) || null;
    if (!profile) {
        saveSettingsDebounced();
        return null;
    }

    profile.apiUrl = settings.independentApiConfig.apiUrl || "";
    profile.apiKey = settings.independentApiConfig.apiKey || "";
    profile.model = settings.independentApiConfig.model || "";
    profile.summaryGenerationMode = normalizeApiProfileMode({
        summaryGenerationMode: settings.summaryGenerationMode,
    });

    saveSettingsDebounced();
    return profile;
}

export function applyApiProfile(profileId) {
    const settings = loadSettings();
    settings.currentApiProfileId = profileId || "";

    if (!profileId) {
        saveSettingsDebounced();
        return null;
    }

    const profile = (settings.apiProfiles || []).find((item) => item.id === profileId);
    if (!profile) {
        saveSettingsDebounced();
        return null;
    }

    settings.independentApiConfig = {
        apiUrl: profile.apiUrl || "",
        apiKey: profile.apiKey || "",
        model: profile.model || "",
    };
    settings.summaryGenerationMode = normalizeApiProfileMode(profile);

    saveSettingsDebounced();
    return profile;
}

export function deleteCurrentApiProfile() {
    const settings = loadSettings();
    const currentId = settings.currentApiProfileId;
    if (!currentId) {
        return null;
    }

    const profile = (settings.apiProfiles || []).find((item) => item.id === currentId) || null;
    settings.apiProfiles = (settings.apiProfiles || []).filter((item) => item.id !== currentId);
    settings.currentApiProfileId = "";
    saveSettingsDebounced();
    return profile;
}

function migrateLegacySettings(bucket) {
    if (bucket.providerMode && !bucket.summaryGenerationMode) {
        bucket.summaryGenerationMode =
            bucket.providerMode === "custom" ? "independent-api" : "shared-api";
    }

    if (bucket.providerConfig && !bucket.independentApiConfig) {
        bucket.independentApiConfig = {
            model: bucket.providerConfig.model || "",
            apiUrl: bucket.providerConfig.apiUrl || "",
            apiKey: bucket.providerConfig.apiKey || "",
        };
    }

    // Clean up removed settings from older versions
    delete bucket.keepRecentMessages;
    delete bucket.summaryTokenBudgetPercent;
    delete bucket.summaryTokenBudgetCap;

    bucket.summaryGenerationMode ||= DEFAULT_SETTINGS.summaryGenerationMode;
    bucket.summaryResponseLength = normalizeNonNegativeInteger(
        bucket.summaryResponseLength,
        DEFAULT_SETTINGS.summaryResponseLength,
    );
    bucket.fusionResponseLength = normalizeNonNegativeInteger(
        bucket.fusionResponseLength,
        DEFAULT_SETTINGS.fusionResponseLength,
    );
    bucket.independentApiConfig ||= structuredClone(DEFAULT_SETTINGS.independentApiConfig);
    bucket.apiProfiles = (bucket.apiProfiles || []).map((profile) => ({
        ...profile,
        summaryGenerationMode: normalizeApiProfileMode(profile),
    }));
    bucket.currentApiProfileId ||= "";
    bucket.customPromptProfiles ||= [];
    bucket.contentCompatibilityPatchEnabled =
        bucket.contentCompatibilityPatchEnabled ?? DEFAULT_SETTINGS.contentCompatibilityPatchEnabled;
    bucket.contentCompatibilityPatchText =
        typeof bucket.contentCompatibilityPatchText === "string"
            ? bucket.contentCompatibilityPatchText
            : DEFAULT_SETTINGS.contentCompatibilityPatchText;
    bucket.summaryEmptyRetryEnabled =
        bucket.summaryEmptyRetryEnabled ?? DEFAULT_SETTINGS.summaryEmptyRetryEnabled;
    bucket.injectionDepthMode = bucket.injectionDepthMode === "auto" ? "auto" : "manual";
}

function normalizeApiProfileMode(profile) {
    const explicit = String(profile?.summaryGenerationMode || "").trim();
    if (explicit === "shared-api" || explicit === "independent-api") {
        return explicit;
    }

    if (
        String(profile?.apiUrl || "").trim() ||
        String(profile?.apiKey || "").trim() ||
        String(profile?.model || "").trim()
    ) {
        return "independent-api";
    }

    return DEFAULT_SETTINGS.summaryGenerationMode;
}
