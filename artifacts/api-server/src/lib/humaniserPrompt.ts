import { getHumaniserLevel, DEFAULT_HUMANISER_LEVEL } from "@workspace/humaniser";

/**
 * Resolves the effective humaniser intensity, applying bounds clamping.
 * Uses the per-request override first, then the workspace setting, then the default.
 */
export function resolveHumaniserIntensity(
  workspace: { humaniserIntensity?: number | null },
  override?: number | null,
): number {
  const raw = override ?? workspace.humaniserIntensity ?? DEFAULT_HUMANISER_LEVEL;
  return Math.max(0, Math.min(9, Math.round(raw)));
}

/**
 * Builds the HUMANISER ENGINE block that is appended to generation system prompts.
 * Returns an empty string at level 0 (Raw AI — no humanisation).
 */
export function buildHumaniserBlock(
  intensity: number,
  domain?: string | null,
): string {
  if (intensity <= 0) return "";

  const level = getHumaniserLevel(intensity);
  const disciplineNote = domain
    ? `Apply language and register appropriate for ${domain} scholarship.`
    : "";

  return [
    `HUMANISER ENGINE — Level ${level.level}: ${level.name}`,
    level.promptInjection,
    disciplineNote,
  ]
    .filter(Boolean)
    .join(" ");
}
