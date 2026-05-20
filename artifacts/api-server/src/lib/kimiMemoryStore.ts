import { downloadText, isStorageConfigured, uploadText } from "./supabaseStorage";
import { logger } from "./logger";

const memoryPath = (workspaceId: number) => `ai-memory/${workspaceId}.json`;

export async function loadKimiMemory(workspaceId: number): Promise<Record<string, unknown>> {
  if (!isStorageConfigured()) return {};
  try {
    const raw = await downloadText(memoryPath(workspaceId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, workspaceId }, "Failed to load Kimi memory");
    return {};
  }
}

export async function persistKimiMemoryEntry(
  workspaceId: number,
  key: string,
  value: unknown,
): Promise<void> {
  if (!isStorageConfigured()) return;
  try {
    const existing = await loadKimiMemory(workspaceId);
    existing[key] = value;
    existing._updatedAt = new Date().toISOString();
    await uploadText(memoryPath(workspaceId), JSON.stringify(existing, null, 2));
  } catch (err) {
    logger.warn({ err, workspaceId, key }, "Failed to persist Kimi memory entry");
  }
}

export async function persistKimiMemoryFromToolOutput(
  workspaceId: number | undefined,
  toolOutput: string,
): Promise<void> {
  if (!workspaceId) return;
  try {
    const parsed = JSON.parse(toolOutput) as Record<string, unknown>;
    const key =
      (typeof parsed.key === "string" && parsed.key) ||
      (typeof parsed.name === "string" && parsed.name) ||
      `entry_${Date.now()}`;
    await persistKimiMemoryEntry(workspaceId, key, parsed);
  } catch {
    await persistKimiMemoryEntry(workspaceId, `raw_${Date.now()}`, toolOutput.slice(0, 4000));
  }
}
