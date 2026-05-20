import OpenAI from "openai";
import { hasKimiKey, isMoonshotWebSearchEnabled } from "./kimiTools";
import { buildPreThesisAgentSystemPrompt, APPLY_PATCH_TOOL } from "./preThesisAgentPrompt";
import { applyPreThesisPatch } from "../services/preThesisPatch";
import type { PreThesisDocumentV2 } from "../types/preThesisDocumentV2";
import { createKimiCompletion } from "./kimiModelRouter";
import { extractReasoning } from "./kimiFormulaTools";

export type PreThesisAgentEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | {
      type: "document_updated";
      document: PreThesisDocumentV2;
      draftMd: string;
      completenessScore: number;
      summary: string;
      scrollAnchor?: string;
    }
  | { type: "done"; totalTokens: number; content: string }
  | { type: "error"; message: string };

const MAX_TOOL_ROUNDS = 8;

function buildTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    APPLY_PATCH_TOOL,
    {
      type: "builtin_function",
      function: { name: "$rethink" },
    } as unknown as OpenAI.Chat.Completions.ChatCompletionTool,
  ];
  if (isMoonshotWebSearchEnabled()) {
    tools.push({
      type: "builtin_function",
      function: { name: "$web_search" },
    } as unknown as OpenAI.Chat.Completions.ChatCompletionTool);
  }
  return tools;
}

export async function runPreThesisAgentChat(params: {
  workspaceId: number;
  userId: number;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: Parameters<typeof buildPreThesisAgentSystemPrompt>[0];
  onEvent: (event: PreThesisAgentEvent) => void;
}): Promise<{ assistantContent: string; totalTokens: number }> {
  if (!hasKimiKey()) {
    const msg = "AI assistant is not configured. Set KIMI_API_KEY.";
    params.onEvent({ type: "error", message: msg });
    return { assistantContent: msg, totalTokens: 0 };
  }

  const systemPrompt = buildPreThesisAgentSystemPrompt(params.context);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...params.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: params.userMessage },
  ];

  let totalTokens = 0;
  let assistantContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { result: response } = await createKimiCompletion({
      messages,
      tools: buildTools(),
      tool_choice: "auto",
      max_tokens: 16384,
      thinking: { type: "enabled" },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      thinking?: { type: "enabled" | "disabled" };
    });

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;
    const msg = choice?.message;
    if (!msg) break;

    const reasoning = extractReasoning(msg);
    if (reasoning?.trim()) {
      params.onEvent({ type: "thinking", content: reasoning.slice(0, 2000) });
    }

    if (msg.content?.trim()) {
      assistantContent += msg.content;
      params.onEvent({ type: "token", content: msg.content });
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      break;
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const fn =
        "function" in tc
          ? tc.function
          : (tc as { function: { name: string; arguments: string } }).function;
      const name = fn.name;

      if (name === "$rethink") {
        params.onEvent({
          type: "thinking",
          content: `Plan: ${fn.arguments || "{}"}`.slice(0, 2000),
        });
        params.onEvent({
          type: "tool_start",
          tool: "rethink",
          message: "Planning next steps…",
        });
        params.onEvent({
          type: "tool_done",
          tool: "rethink",
          message: "Plan ready",
          ok: true,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: true, status: "rethink_acknowledged" }),
        });
        continue;
      }

      if (name === "$web_search") {
        params.onEvent({
          type: "tool_start",
          tool: "web_search",
          message: "Searching university guidelines…",
        });
        params.onEvent({
          type: "tool_done",
          tool: "web_search",
          message: "Web search complete",
          ok: true,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: true, status: "search_executed" }),
        });
        continue;
      }

      if (name === "apply_pre_thesis_patch") {
        params.onEvent({
          type: "tool_start",
          tool: "apply_pre_thesis_patch",
          message: "Updating document structure…",
        });

        let toolResult: string;
        let ok = true;
        let scrollAnchor: string | undefined;

        try {
          const args = JSON.parse(fn.arguments || "{}") as {
            patch?: Record<string, unknown>;
            summary?: string;
          };
          if (!args.patch) throw new Error("Missing patch");

          const result = await applyPreThesisPatch(
            params.workspaceId,
            params.userId,
            args.patch,
            args.summary ?? "AI assistant update",
            "ai",
          );

          scrollAnchor = inferScrollAnchor(args.patch);

          params.onEvent({
            type: "document_updated",
            document: result.document,
            draftMd: result.draftMd,
            completenessScore: result.completenessScore,
            summary: result.summary,
            scrollAnchor,
          });

          toolResult = JSON.stringify({
            ok: true,
            summary: result.summary,
            completenessScore: result.completenessScore,
          });
        } catch (err) {
          ok = false;
          toolResult = JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : "Patch failed",
          });
        }

        params.onEvent({
          type: "tool_done",
          tool: "apply_pre_thesis_patch",
          message: ok ? "Document updated" : "Patch failed",
          ok,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResult,
        });
        continue;
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
      });
    }
  }

  params.onEvent({ type: "done", totalTokens, content: assistantContent });
  return { assistantContent, totalTokens };
}

function inferScrollAnchor(patch: Record<string, unknown>): string | undefined {
  if (patch.chapterBlueprints) return "pt-chapters";
  if (patch.formattingSpecs) return "pt-formatting";
  if (patch.partA) return "pt-part-a";
  if (patch.partB) return "pt-part-b";
  if (patch.partC) return "pt-part-c";
  if (patch.sources) return "pt-rules";
  return undefined;
}
