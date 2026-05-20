import { loadWorkspaceEnv } from "./loadEnv";

// Load root `.env` before any module that reads process.env at import time (e.g. @workspace/db).
loadWorkspaceEnv();

const { default: app } = await import("./app");
const { logger } = await import("./lib/logger");

const rawPort = process.env["API_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  void import("./services/postLockVault").then(({ processPendingPostLockJobs }) => {
    setInterval(() => {
      void processPendingPostLockJobs(5).catch(() => undefined);
    }, 60_000);
  });
});
