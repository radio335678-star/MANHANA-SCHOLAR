import OpenAI from "openai";
import { getModelChain, getPrimaryModel, getKimiBaseUrl, getKimiApiKey, resolveKimiThinkingParams } from "./kimiModels";
import { logger } from "./logger";

export {
  getModelChain,
  getPrimaryModel,
  getKimiBaseUrl,
  getKimiApiKey,
  KIMI_FRONTIER_FALLBACK,
  KIMI_FRONTIER_PRIMARY,
  KIMI_DEFAULT_BASE_URL,
} from "./kimiModels";

export const KIMI_PRIMARY_MODEL = getPrimaryModel();

export const KIMI_FALLBACK_MODELS = getModelChain().slice(1);

function isRetryableModelError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("timeout") ||
    msg.includes("not found") ||
    msg.includes("model") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("missing") ||
    msg.includes("invalid") ||
    msg.includes("400")
  );
}

export type ModelCallResult<T> = {
  result: T;
  modelUsed: string;
  fallbacksAttempted: string[];
};

let _client: OpenAI | null = null;

export function createKimiClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: getKimiApiKey() || "placeholder",
      baseURL: getKimiBaseUrl(),
    });
  }
  return _client;
}

export async function withKimiModelFallback<T>(
  label: string,
  fn: (model: string) => Promise<T>,
): Promise<ModelCallResult<T>> {
  const chain = getModelChain();
  const fallbacksAttempted: string[] = [];
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    try {
      const result = await fn(model);
      if (i > 0) {
        logger.info({ label, model, fallbacksAttempted }, "Kimi model fallback succeeded");
      }
      return { result, modelUsed: model, fallbacksAttempted };
    } catch (err) {
      lastError = err;
      fallbacksAttempted.push(model);
      const retryable = isRetryableModelError(err);
      logger.warn({ err, label, model, retryable }, "Kimi model call failed");
      if (!retryable && i === 0) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}: all models failed`);
}

export async function createKimiCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    thinking?: { type: "enabled" | "disabled" };
  },
): Promise<ModelCallResult<OpenAI.Chat.Completions.ChatCompletion>> {
  const client = createKimiClient();
  const withTools =
    params.tools?.length && params.parallel_tool_calls === undefined
      ? { ...params, parallel_tool_calls: true as const }
      : params;

  return withKimiModelFallback("chat.completions", async (model) => {
    return client.chat.completions.create(
      resolveKimiThinkingParams({
        ...withTools,
        model,
        thinking: withTools.thinking ?? { type: "enabled" },
      }) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );
  });
}
