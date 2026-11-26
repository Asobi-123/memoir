import { getSettings } from "../../state/settings-store.js";
import { normalizeChatCompletionsUrl } from "../../utils.js";

const REQUEST_TIMEOUT_MS = 120_000;

let activeController = null;

export function abortCurrentGeneration() {
    if (activeController) {
        activeController.abort();
        activeController = null;
    }
}

export async function runCustomSummaryProvider(request, { settings = getSettings(), signal } = {}) {
    const { apiUrl, apiKey, model } = settings.independentApiConfig;
    const maxTokens = Number(request.maxTokens);

    if (!apiUrl || !model) {
        throw new Error("Custom provider requires API URL and model.");
    }

    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (!signal) {
        abortCurrentGeneration();
        activeController = controller;
    }
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(normalizeChatCompletionsUrl(apiUrl), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: request.promptBundle.systemPrompt },
                    { role: "user", content: request.promptBundle.userPrompt },
                ],
                ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
                temperature: 0.2,
                stream: false,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Custom provider failed: ${response.status} ${response.statusText} ${errorText}`);
        }

        const data = await response.json();
        const rawText = extractMessageContent(data?.choices?.[0]?.message);

        const archiveSummary = String(rawText || "").trim();
        return {
            rawText,
            parseError: "",
            parsed: null,
            archiveSummary,
            injectSummary: archiveSummary,
            providerModel: model,
        };
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (activeController === controller) activeController = null;
    }
}

function extractMessageContent(message) {
    const content = message?.content;
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === "string") {
                    return part;
                }
                return part?.text || part?.content || "";
            })
            .join("");
    }
    return "";
}
