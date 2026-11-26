import { runStSummaryProvider } from "./providers/st-provider.js";
import { runCustomSummaryProvider } from "./providers/custom-provider.js";
import { isIndependentApiConfigured } from "../state/settings-store.js";

export async function runSummaryProvider(request, settings, { signal, automatic = false } = {}) {
    const independentMode = settings.summaryGenerationMode === "independent-api";
    const independentReady = isIndependentApiConfigured(settings);

    if (independentMode && independentReady) {
        const result = await runCustomSummaryProvider(request, { settings, signal });
        return {
            ...result,
            providerResolved: "independent-api",
            providerFallbackUsed: false,
        };
    }

    if (automatic) {
        throw Object.assign(new Error("provider-incomplete"), { code: "provider-incomplete" });
    }

    const result = await runStSummaryProvider(request);
    return {
        ...result,
        providerResolved: "shared-api",
        providerFallbackUsed: independentMode && !independentReady,
        providerFallbackReason:
            independentMode && !independentReady
                ? "Independent API mode selected but config is incomplete; fell back to shared API."
                : "",
    };
}
