import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Load `.env` from the workspace root (or parents) without overwriting variables
 * already set in the process environment (e.g. Replit secrets, CI).
 */
export function loadWorkspaceEnv(startDir = process.cwd()): void {
  const candidates: string[] = [];
  let dir = path.resolve(startDir);

  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, ".env"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    applyEnvFile(envPath);
    return;
  }
}

function applyEnvFile(envPath: string): void {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
