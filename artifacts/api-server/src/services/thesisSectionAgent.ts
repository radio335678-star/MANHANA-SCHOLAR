import OpenAI from "openai";
import { db } from "@workspace/db";
import { sectionsTable, eq } from "@workspace/db";
import { markdownToHtml } from "../lib/markdownToHtml";
import {
  createKimiCompletion,
  extractReasoning,
  hasMoonshotKey,
  legacyWebSearchTool,
  loadFormulaTools,
  runToolCallsFromMessage,
  THESIS_FORMULA_URIS,
} from "../lib/kimiFormulaTools";
import {
  APPLY_SECTION_PATCH_TOOL,
  buildResearchPassPrompt,
  buildThesisGenerateSystemPrompt,
  buildThesisSectionSystemPrompt,
} from "../lib/thesisAgentPrompt";
import { getAdjacentSectionSummaries } from "./sectionCoherence";
import type { WorkspaceAiContext } from "../lib/workspaceContext";

export type ThesisSectionAgentEvent =
  | { type: "thinking"; content: string }
  | { type: "token"; content: string }
  | { type: "tool_start"; tool: string; message: string }
  | { type: "tool_done"; tool: string; message: string; ok: boolean }
  | { type: "section_updated"; content: string; summary: string }
  | { type: "done"; content: string; totalTokens: number }
  | { type: "error"; message: string };

const MAX_ROUNDS = 10;

async function runResearchPass(params: {
  thesisTitle: string;
  sectionTitle: string;
  domain?: string | null;
  contextBlock?: string;
  onEvent: (e: ThesisSectionAgentEvent) => void;
}): Promise<string> {
  const { tools, toolToUri } = await loadFormulaTools(["moonshot/web-search:latest", "moonshot/fetch:latest"]);
  const allTools = tools.length ? tools : [legacyWebSearchTool()];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildResearchPassPrompt({
        thesisTitle: params.thesisTitle,
        sectionTitle: params.sectionTitle,
        domain: params.domain,
        contextBlock: params.contextBlock,
      }),
    },
    {
      role: "user",
      content: `Research evidence needed for the "${params.sectionTitle}" section.`,
    },
  ];

  let researchBrief = "";
  let totalTokens = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = (await createKimiCompletion({
      messages,
      tools: allTools,
      thinking: "enabled",
      maxTokens: 4096,
    })) as OpenAI.Chat.Completions.ChatCompletion;

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;
    const msg = choice?.message;
    if (!msg) break;

    if (msg.content?.trim()) {
      researchBrief += msg.content;
      params.onEvent({ type: "token", content: msg.content });
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) break;

    params.onEvent({ type: "tool_start", tool: "web_search", message: "Searching for evidence…" });
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

    const results = await runToolCallsFromMessage({ toolCalls, toolToUri, workspaceId: params.workspaceId });
    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
    }
    params.onEvent({ type: "tool_done", tool: "web_search", message: "Research complete", ok: true });
  }

  return researchBrief.trim();
}

export async function runThesisSectionAgent(params: {
  workspaceId: number;
  sectionId: number;
  userMessage?: string;
  mode: "chat" | "generate";
  aiCtx: WorkspaceAiContext;
  workspace: { title: string; domain?: string | null; qualification?: string | null };
  section: {
    id: number;
    title: string;
    type: string;
    content?: string | null;
    targetPages?: number | null;
    minPages?: number | null;
    maxPages?: number | null;
  };
  userProfile?: { qualification?: string | null; domain?: string | null } | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  attachmentContext?: string;
  skipResearch?: boolean;
  onEvent: (event: ThesisSectionAgentEvent) => void;
}): Promise<{ content: string; totalTokens: number }> {
  if (!hasMoonshotKey()) {
    const msg = "AI assistant is not configured. Set MOONSHOT_API_KEY.";
    params.onEvent({ type: "error", message: msg });
    return { content: msg, totalTokens: 0 };
  }

  let totalTokens = 0;
  let researchNotes = "";

  if (!params.skipResearch && params.mode === "generate") {
    params.onEvent({ type: "tool_start", tool: "research", message: "Running research pass…" });
    researchNotes = await runResearchPass({
      thesisTitle: params.workspace.title,
      sectionTitle: params.section.title,
      domain: params.userProfile?.domain ?? params.workspace.domain,
      contextBlock: params.aiCtx.contextBlock,
      onEvent: params.onEvent,
    });
    params.onEvent({ type: "tool_done", tool: "research", message: "Research pass complete", ok: true });
  }

  const adjacentSummaries = await getAdjacentSectionSummaries(params.workspaceId, params.sectionId);

  const systemPrompt =
    params.mode === "generate"
      ? buildThesisGenerateSystemPrompt({
          qualification: params.userProfile?.qualification ?? params.workspace.qualification,
          domain: params.userProfile?.domain ?? params.workspace.domain,
          toneDesc: "formal academic prose suitable for a medical thesis",
          wordHint: "",
          contextBlock: params.aiCtx.contextBlock,
          vaultResourceCount: params.aiCtx.vaultResourceCount,
          sectionTitle: params.section.title,
          targetPages: params.section.targetPages,
          adjacentSummaries,
          researchNotes,
        })
      : buildThesisSectionSystemPrompt({
          qualification: params.userProfile?.qualification ?? params.workspace.qualification,
          domain: params.userProfile?.domain ?? params.workspace.domain,
          thesisTitle: params.workspace.title,
          sectionTitle: params.section.title,
          sectionType: params.section.type,
          targetPages: params.section.targetPages,
          minPages: params.section.minPages,
          maxPages: params.section.maxPages,
          sectionContent: params.section.content,
          contextBlock: params.aiCtx.contextBlock,
          vaultResourceCount: params.aiCtx.vaultResourceCount,
          adjacentSummaries,
          researchNotes,
          attachmentContext: params.attachmentContext,
        });

  const tools = [APPLY_SECTION_PATCH_TOOL];
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(params.history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const userContent =
    params.userMessage ??
    (params.mode === "generate"
      ? `Write the complete "${params.section.title}" section at premium submission quality.`
      : "");

  if (userContent) {
    messages.push({ role: "user", content: userContent });
  }

  let assistantContent = "";
  let savedContent = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = (await createKimiCompletion({
      messages,
      tools,
      thinking: "enabled",
      maxTokens: params.section.targetPages ? Math.min(32768, params.section.targetPages * 350) : 8192,
    })) as OpenAI.Chat.Completions.ChatCompletion;

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;
    const msg = choice?.message;
    if (!msg) break;

    const reasoning = extractReasoning(msg);
    if (reasoning?.trim()) {
      params.onEvent({ type: "thinking", content: reasoning.slice(0, 3000) });
    }

    if (msg.content?.trim()) {
      assistantContent += msg.content;
      params.onEvent({ type: "token", content: msg.content });
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) break;

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fn = "function" in tc ? tc.function : (tc as { function: { name: string; arguments: string } }).function;
      if (fn.name !== "apply_section_patch") continue;

      params.onEvent({
        type: "tool_start",
        tool: "apply_section_patch",
        message: "Saving section content…",
      });

      try {
          const args = JSON.parse(fn.arguments || "{}") as {
          content?: string;
          summary?: string;
        };
        const raw = args.content ?? assistantContent;
        savedContent = raw;
        const html = markdownToHtml(raw);
        const wordCount = raw.trim().split(/\s+/).filter(Boolean).length;

        await db
          .update(sectionsTable)
          .set({
            content: html,
            status: "in_progress",
            wordCount,
            updatedAt: new Date(),
          })
          .where(eq(sectionsTable.id, params.sectionId));

        params.onEvent({
          type: "section_updated",
          content: raw,
          summary: args.summary ?? "Section updated",
        });
        params.onEvent({
          type: "tool_done",
          tool: "apply_section_patch",
          message: "Section saved",
          ok: true,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: true, wordCount }),
        });
      } catch (err) {
        params.onEvent({
          type: "tool_done",
          tool: "apply_section_patch",
          message: "Save failed",
          ok: false,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : "Patch failed",
          }),
        });
      }
    }
  }

  const finalContent = savedContent || assistantContent;
  params.onEvent({ type: "done", content: finalContent, totalTokens });
  return { content: finalContent, totalTokens };
}
