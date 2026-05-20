#!/usr/bin/env node
/**
 * Verifies Supabase-related env vars are present (never prints secret values).
 * Run from repo root: node scripts/verify-supabase-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
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

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, "artifacts", "web", ".env"));

const REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];

const PLACEHOLDER = /REPLACE_WITH|\[YOUR/i;

let ok = true;

console.log("Supabase environment check\n");

for (const key of REQUIRED) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    console.log(`  ✗ ${key} — missing`);
    ok = false;
    continue;
  }
  if (PLACEHOLDER.test(value)) {
    console.log(`  ✗ ${key} — still a placeholder (update in .env, do not commit secrets)`);
    ok = false;
    continue;
  }
  if (key === "DATABASE_URL" && !value.startsWith("postgresql://")) {
    console.log(
      `  ✗ ${key} — must be a postgresql:// pooler URL (Dashboard → Database → Connect), not the REST/API URL`,
    );
    ok = false;
    continue;
  }
  if (
    (key === "SUPABASE_SERVICE_ROLE_KEY" || key === "SUPABASE_ANON_KEY") &&
    value.startsWith("http")
  ) {
    console.log(`  ✗ ${key} — looks like a URL; paste the JWT key from Settings → API`);
    ok = false;
    continue;
  }
  console.log(`  ✓ ${key} — set`);
}

const optional = ["SUPABASE_STORAGE_BUCKET", "API_PORT", "KIMI_API_KEY"];
console.log("\nOptional:");
for (const key of optional) {
  const value = process.env[key];
  if (!value) {
    console.log(`  · ${key} — not set`);
  } else if (PLACEHOLDER.test(value)) {
    console.log(`  · ${key} — placeholder`);
  } else {
    console.log(`  ✓ ${key} — set`);
  }
}

if (!ok) {
  console.log(
    "\nFix placeholders in .env (Dashboard → Project Settings → API / Database).",
  );
  process.exit(1);
}

console.log("\nAll required Supabase variables are configured.");
process.exit(0);
