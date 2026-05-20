/** Frontier Kimi models (international API: api.moonshot.ai). */
export const KIMI_FRONTIER_PRIMARY = "kimi-k2.6";
export const KIMI_FRONTIER_FALLBACK = "kimi-k2.5";

export const KIMI_DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";

export function getKimiBaseUrl(): string {
  return process.env.KIMI_BASE_URL ?? process.env.MOONSHOT_BASE_URL ?? KIMI_DEFAULT_BASE_URL;
}

export function getKimiApiKey(): string {
  return process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY ?? "";
}

export function getPrimaryModel(): string {
  return process.env.KIMI_PRIMARY_MODEL ?? process.env.KIMI_MODEL ?? KIMI_FRONTIER_PRIMARY;
}

export function getFallbackModels(): string[] {
  return (process.env.KIMI_FALLBACK_MODELS ?? KIMI_FRONTIER_FALLBACK)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export function getModelChain(): string[] {
  return [...new Set([getPrimaryModel(), ...getFallbackModels()])];
}

/** Kimi thinking models only accept temperature = 1. */
export function resolveKimiThinkingParams<T extends { temperature?: number | null; thinking?: { type: "enabled" | "disabled" } }>(
  params: T,
): T & { thinking: { type: "enabled" | "disabled" } } {
  const thinking = params.thinking ?? { type: "enabled" as const };
  if (thinking.type === "enabled") {
    return { ...params, thinking, temperature: 1 };
  }
  return { ...params, thinking };
}
