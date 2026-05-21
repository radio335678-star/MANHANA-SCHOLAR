import OpenAI from "openai";
import { logger } from "./logger";
import { getPrimaryModel, getKimiBaseUrl, getKimiApiKey, resolveKimiThinkingParams } from "./kimiModels";
import { withKimiModelFallback, createKimiClient } from "./kimiModelRouter";
import { persistKimiMemoryFromToolOutput } from "./kimiMemoryStore";

export const KIMI_K26_MODEL = getPrimaryModel();

export const THESIS_FORMULA_URIS = [
  "moonshot/web-search:latest",
  "moonshot/fetch:latest",
  "moonshot/excel:latest",
  "moonshot/memory:latest",
  "moonshot/quick_js:latest",
] as const;

function getBaseUrl(): string {
  return getKimiBaseUrl();
}

function getApiKey(): string {
  return getKimiApiKey();
}

export function getKimiClient(): OpenAI {
  return createKimiClient();
}

export function hasMoonshotKey(): boolean {
  return Boolean(getApiKey());
}

export async function loadFormulaTools(
  formulaUris: readonly string[],
): Promise<{ tools: OpenAI.Chat.Completions.ChatCompletionTool[]; toolToUri: Record<string, string> }> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
  const toolToUri: Record<string, string> = {};

  for (const uri of formulaUris) {
    try {
      const res = await fetch(`${baseUrl}/formulas/${encodeURIComponent(uri)}/tools`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        logger.warn({ uri, status: res.status }, "Failed to load formula tools");
        continue;
      }
      const data = (await res.json()) as { tools?: OpenAI.Chat.Completions.ChatCompletionTool[] };
      for (const tool of data.tools ?? []) {
        const fn = (tool as { function?: { name?: string } }).function;
        const name = fn?.name;
        if (!name || toolToUri[name]) continue;
        toolToUri[name] = uri;
        tools.push(tool);
      }
    } catch (err) {
      logger.warn({ err, uri }, "Formula tool discovery failed");
    }
  }

  return { tools, toolToUri };
}

export async function executeFormulaFiber(
  formulaUri: string,
  functionName: string,
  argsJson: string,
): Promise<string> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/formulas/${encodeURIComponent(formulaUri)}/fibers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: functionName, arguments: argsJson }),
  });

  if (!res.ok) {
    const text = await res.text();
    return JSON.stringify({ ok: false, error: text || res.statusText });
  }

  const fiber = (await res.json()) as {
    status?: string;
    context?: { output?: string; encrypted_output?: string; error?: string };
    error?: string;
  };

  if (fiber.status === "succeeded") {
    return (
      fiber.context?.encrypted_output ??
      fiber.context?.output ??
      JSON.stringify({ ok: true })
    );
  }

  return JSON.stringify({
    ok: false,
    error: fiber.error ?? fiber.context?.error ?? fiber.context?.output ?? "Fiber failed",
  });
}

export function legacyWebSearchTool(): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "builtin_function",
    function: { name: "$web_search" },
  } as unknown as OpenAI.Chat.Completions.ChatCompletionTool;
}

export type ThinkingMode = "enabled" | "disabled";

export async function createKimiCompletion(params: {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  thinking?: ThinkingMode;
  maxTokens?: number;
  stream?: boolean;
}): Promise<
  | OpenAI.Chat.Completions.ChatCompletion
  | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
> {
  const client = getKimiClient();
  const thinkingType =
    params.thinking === "disabled" ? "disabled" : "enabled";

  const { result } = await withKimiModelFallback("formula.chat", async (model) => {
    const body = resolveKimiThinkingParams({
      model,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools?.length ? ("auto" as const) : undefined,
      parallel_tool_calls: params.tools?.length ? true : undefined,
      max_tokens: params.maxTokens ?? 32768,
      stream: params.stream ?? false,
      thinking: { type: thinkingType },
    });

    if (params.stream) {
      return client.chat.completions.create({ ...body, stream: true });
    }
    return client.chat.completions.create(body);
  });

  return result;
}

export async function runToolCallsFromMessage(params: {
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  toolToUri: Record<string, string>;
  workspaceId?: number;
}): Promise<Array<{ toolCallId: string; content: string }>> {
  const results: Array<{ toolCallId: string; content: string }> = [];

  for (const tc of params.toolCalls) {
    const fn = "function" in tc ? tc.function : (tc as { function: { name: string; arguments: string } }).function;
    const name = fn.name;

    if (name === "$web_search") {
      results.push({
        toolCallId: tc.id,
        content: JSON.stringify({ ok: true, status: "search_executed" }),
      });
      continue;
    }

    const uri = params.toolToUri[name];
    if (!uri) {
      results.push({
        toolCallId: tc.id,
        content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
      });
      continue;
    }

    const output = await executeFormulaFiber(uri, name, fn.arguments || "{}");

    if (uri.includes("memory")) {
      await persistKimiMemoryFromToolOutput(params.workspaceId, output);
    }

    results.push({ toolCallId: tc.id, content: output });
  }

  return results;
}

export function extractReasoning(message: OpenAI.Chat.Completions.ChatCompletionMessage): string | undefined {
  return (
    (message as { reasoning_content?: string }).reasoning_content ??
    (message as { thinking?: string }).thinking
  );
}

/** Replay assistant tool-call turns for Kimi thinking models (requires reasoning_content). */
export function buildAssistantToolCallMessage(
  msg: OpenAI.Chat.Completions.ChatCompletionMessage,
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  const toolCalls = msg.tool_calls;
  if (!toolCalls?.length) {
    return { role: "assistant", content: msg.content ?? "" };
  }
  const reasoning = extractReasoning(msg) ?? "";
  return {
    role: "assistant",
    content: msg.content ?? "",
    tool_calls: toolCalls,
    reasoning_content: reasoning,
  } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
}
