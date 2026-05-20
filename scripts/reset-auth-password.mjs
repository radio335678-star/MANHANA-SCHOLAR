#!/usr/bin/env node
/**
 * Reset a Supabase Auth user password via Admin API (service role).
 * Usage: node scripts/reset-auth-password.mjs <email> <new-password>
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

const email = process.argv[2];
const password = process.argv[3];
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password) {
  console.error("Usage: node scripts/reset-auth-password.mjs <email> <new-password>");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  "Content-Type": "application/json",
};

const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
const listBody = await listRes.json();
if (!listRes.ok) {
  console.error("listUsers failed:", listRes.status, JSON.stringify(listBody).slice(0, 300));
  process.exit(1);
}

const user = (listBody.users ?? []).find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);
if (!user) {
  console.error("User not found:", email);
  process.exit(1);
}

const updateRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password, email_confirm: true }),
});
const updateBody = await updateRes.json();
if (!updateRes.ok) {
  console.error("updateUser failed:", updateRes.status, JSON.stringify(updateBody).slice(0, 300));
  process.exit(1);
}

console.log("OK", updateBody.email ?? updateBody.id, "confirmed", Boolean(updateBody.email_confirmed_at));
