import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** Fail production builds when Supabase public env vars are missing or wrong key type. */
function supabaseBuildEnvCheck(): Plugin {
  return {
    name: "supabase-build-env-check",
    buildStart() {
      if (process.env.NODE_ENV !== "production") return;
      const url = process.env.VITE_SUPABASE_URL?.trim();
      const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();
      if (!url || !key) {
        this.error(
          "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in Vercel → Environment Variables, then redeploy.",
        );
      }
      if (key.startsWith("sb_publishable_")) {
        this.error(
          "VITE_SUPABASE_ANON_KEY must be the legacy anon JWT (eyJ...), not sb_publishable_, for @supabase/supabase-js auth.",
        );
      }
    },
  };
}

const rawPort = process.env.PORT ?? "22333";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    supabaseBuildEnvCheck(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "5000"}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
