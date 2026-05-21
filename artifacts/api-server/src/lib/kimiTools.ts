import OpenAI from "openai";
import { db } from "@workspace/db";
import { guidelineSearchCacheTable, eq } from "@workspace/db";
import { getKimiApiKey } from "./kimiModels";
import { logger } from "./logger";
import { createKimiCompletion } from "./kimiModelRouter";
import {
  generateWorkbookSafe,
  workbookToLegacySpec,
  type WorkbookSpec,
} from "./sheetGeneration";

export type WebSearchResult = {
  query?: string;
  title: string;
  url: string;
  snippet: string;
  confidence?: string;
  sourceType?: string;
};

export function hasKimiKey(): boolean {
  return Boolean(getKimiApiKey());
}

export function isMoonshotWebSearchEnabled(): boolean {
  return process.env.MOONSHOT_WEB_SEARCH !== "false" && hasKimiKey();
}

async function getCachedResults(cacheKey: string): Promise<WebSearchResult[] | null> {
  try {
    const [row] = await db
      .select()
      .from(guidelineSearchCacheTable)
      .where(eq(guidelineSearchCacheTable.cacheKey, cacheKey))
      .limit(1);
    if (!row || new Date(row.expiresAt) < new Date()) return null;
    return row.resultsJson as WebSearchResult[];
  } catch {
    return null;
  }
}

async function setCachedResults(cacheKey: string, results: WebSearchResult[]): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.delete(guidelineSearchCacheTable).where(eq(guidelineSearchCacheTable.cacheKey, cacheKey));
    await db.insert(guidelineSearchCacheTable).values({
      cacheKey,
      resultsJson: results,
      expiresAt,
    });
  } catch (err) {
    logger.warn({ err, cacheKey }, "Failed to cache search results");
  }
}

async function moonshotNativeSearch(query: string): Promise<WebSearchResult> {
  try {
    const { result: response } = await createKimiCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant for Indian medical university thesis guidelines. Use web search when available. Return JSON only: {\"title\":string,\"url\":string,\"snippet\":string,\"sourceType\":string,\"confidence\":\"high\"|\"medium\"|\"low\"}",
        },
        {
          role: "user",
          content: `Search and summarize official guidance for: ${query}`,
        },
      ],
      tools: [
        {
          type: "builtin_function",
          function: { name: "$web_search" },
        } as unknown as OpenAI.Chat.Completions.ChatCompletionTool,
      ],
      max_tokens: 2048,
      thinking: { type: "disabled" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content) as WebSearchResult;
      return { query, ...parsed, title: parsed.title || query };
    } catch {
      return {
        query,
        title: query,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: content.slice(0, 500) || "Web search completed",
        sourceType: "web_search",
        confidence: "medium",
      };
    }
  } catch (err) {
    logger.warn({ err, query }, "moonshotNativeSearch failed, falling back");
    return fallbackChatSearch(query);
  }
}

async function fallbackChatSearch(query: string): Promise<WebSearchResult> {
  const { result: response } = await createKimiCompletion({
    messages: [
      {
        role: "system",
        content:
          "You are a research assistant for Indian medical university thesis guidelines. Return concise factual summaries only.",
      },
      {
        role: "user",
        content: `Summarize current official guidance for: ${query}. Max 150 words.`,
      },
    ],
    max_tokens: 256,
    temperature: 0.3,
  });
  return {
    query,
    title: query,
    url: "",
    snippet: response.choices[0]?.message?.content ?? "Search unavailable",
    sourceType: "template_fallback",
    confidence: "low",
  };
}

/**
 * Moonshot-native web search with 7-day cache. Falls back to chat summary if native search fails.
 */
export async function kimiWebSearch(
  queries: string[],
  cacheKey?: string,
): Promise<WebSearchResult[]> {
  if (!hasKimiKey()) {
    return queries.map((q) => ({
      query: q,
      title: `Template fallback: ${q}`,
      url: "",
      snippet: "Live search unavailable — using internal template database only.",
      sourceType: "template",
      confidence: "low",
    }));
  }

  if (cacheKey) {
    const cached = await getCachedResults(cacheKey);
    if (cached?.length) return cached;
  }

  const results: WebSearchResult[] = [];
  const useNative = isMoonshotWebSearchEnabled();

  for (const query of queries.slice(0, 8)) {
    const result = useNative ? await moonshotNativeSearch(query) : await fallbackChatSearch(query);
    results.push(result);
  }

  if (cacheKey && results.length > 0) {
    await setCachedResults(cacheKey, results);
  }

  return results;
}

export type SheetColumnSpec = {
  header: string;
  type: "string" | "number" | "date";
  validation?: { min?: number; max?: number; options?: string[] };
};

export type SheetSpec = {
  name: string;
  columns: SheetColumnSpec[];
  sampleRows?: Record<string, string | number>[];
};

export type StoredChartSchema = SheetSpec & {
  sheets?: SheetSpec[];
};

export async function kimiGenerateSheetSpec(
  prompt: string,
  context: string,
  currentSheet?: SheetSpec | null,
): Promise<{
  spec: SheetSpec & { sheets?: SheetSpec[] };
  modelUsed: string;
  workbook: WorkbookSpec;
  usedFallback: boolean;
}> {
  const { spec: workbook, modelUsed, usedFallback } = await generateWorkbookSafe(
    prompt,
    context,
    currentSheet,
  );
  return {
    spec: workbookToLegacySpec(workbook),
    modelUsed,
    workbook,
    usedFallback,
  };
}

export async function kimiJsonCompletion<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192,
): Promise<{ data: T | null; modelUsed?: string }> {
  if (!hasKimiKey()) return { data: null };
  try {
    const { result, modelUsed } = await createKimiCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.35,
      response_format: { type: "json_object" },
    });
    const raw = result.choices[0]?.message?.content ?? "{}";
    return { data: JSON.parse(raw) as T, modelUsed };
  } catch (err) {
    logger.warn({ err }, "kimiJsonCompletion failed");
    return { data: null };
  }
}
