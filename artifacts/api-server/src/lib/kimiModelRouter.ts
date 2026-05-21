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

export type KimiStreamEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string };

type KimiStreamDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
};

type AccumulatedToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function accumulateStreamToolCalls(
  acc: Map<number, AccumulatedToolCall>,
  deltas: KimiStreamDelta["tool_calls"],
): void {
  if (!deltas?.length) return;
  for (const tc of deltas) {
    let entry = acc.get(tc.index);
    if (!entry) {
      entry = { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } };
      acc.set(tc.index, entry);
    }
    if (tc.id) entry.id = tc.id;
    if (tc.function?.name) entry.function.name += tc.function.name;
    if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
  }
}

async function consumeKimiCompletionStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string,
  onStream?: (event: KimiStreamEvent) => void,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let content = "";
  let reasoning = "";
  const toolCallsAcc = new Map<number, AccumulatedToolCall>();
  let finishReason: OpenAI.Chat.Completions.ChatCompletion.Choice["finish_reason"] = "stop";
  let usage: OpenAI.Completions.CompletionUsage | undefined;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }

    const delta = choice?.delta as KimiStreamDelta | undefined;
    if (delta?.reasoning_content) {
      reasoning += delta.reasoning_content;
      onStream?.({ type: "thinking", content: delta.reasoning_content });
    }
    if (delta?.content) {
      content += delta.content;
      onStream?.({ type: "token", content: delta.content });
    }
    accumulateStreamToolCalls(toolCallsAcc, delta?.tool_calls);
    if (chunk.usage) usage = chunk.usage;
  }

  const tool_calls = [...toolCallsAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc)
    .filter((tc) => tc.id && tc.function.name);

  const message = {
    role: "assistant" as const,
    content: content || null,
    ...(tool_calls.length ? { tool_calls } : {}),
    ...(reasoning ? { reasoning_content: reasoning } : {}),
  };

  return {
    id: `stream-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: message as OpenAI.Chat.Completions.ChatCompletionMessage,
        finish_reason: tool_calls.length ? "tool_calls" : finishReason,
      },
    ],
    usage,
  };
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

export async function createKimiCompletionStreaming(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    thinking?: { type: "enabled" | "disabled" };
  },
  onStream?: (event: KimiStreamEvent) => void,
): Promise<ModelCallResult<OpenAI.Chat.Completions.ChatCompletion>> {
  const client = createKimiClient();
  const withTools =
    params.tools?.length && params.parallel_tool_calls === undefined
      ? { ...params, parallel_tool_calls: true as const }
      : params;

  return withKimiModelFallback("chat.completions.stream", async (model) => {
    const stream = await client.chat.completions.create(
      resolveKimiThinkingParams({
        ...withTools,
        model,
        stream: true,
        stream_options: { include_usage: true },
        thinking: withTools.thinking ?? { type: "enabled" },
      }) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    );
    return consumeKimiCompletionStream(stream, model, onStream);
  });
}
