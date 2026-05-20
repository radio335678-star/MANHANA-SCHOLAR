import type OpenAI from "openai";
import { extractReasoning } from "./kimiFormulaTools";

function tryParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continue */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch {
      /* continue */
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      /* continue */
    }
  }

  return null;
}

export function parseModelJson<T>(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | string | null | undefined,
): T | null {
  if (!message) return null;

  if (typeof message === "string") {
    return tryParseJson<T>(message);
  }

  const content = message.content ?? "";
  const reasoning = extractReasoning(message) ?? "";

  for (const candidate of [content, reasoning]) {
    const parsed = tryParseJson<T>(candidate);
    if (parsed) return parsed;
  }

  return null;
}
