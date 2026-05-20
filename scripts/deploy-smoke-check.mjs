#!/usr/bin/env node
/**
 * Post-deploy smoke checks. Usage:
 *   node scripts/deploy-smoke-check.mjs
 *   node scripts/deploy-smoke-check.mjs https://your-railway-host.up.railway.app
 *   node scripts/deploy-smoke-check.mjs https://your-app.vercel.app
 */
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/deploy-smoke-check.mjs <BASE_URL>");
  console.error("  Railway: https://xxx.up.railway.app");
  console.error("  Vercel:  https://xxx.vercel.app (proxied /api)");
  process.exit(1);
}

const paths = ["/api/healthz", "/api/healthz/ready"];

let failed = 0;
for (const path of paths) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const ok = res.ok;
    console.log(`${ok ? "✓" : "✗"} ${res.status} ${url}`);
    if (!ok) {
      console.log(`  ${text.slice(0, 200)}`);
      failed++;
    } else if (path.endsWith("/ready")) {
      try {
        const j = JSON.parse(text);
        console.log(`  checks: ${JSON.stringify(j.checks ?? j)}`);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.log(`✗ ${url}`);
    console.log(`  ${err.message}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
