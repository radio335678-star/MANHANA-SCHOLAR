import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { workspacesTable, eq } from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  runThesisAutoComplete,
  requestAutoCompleteCancel,
  validateAutoCompletePrerequisites,
} from "../services/thesisAutoComplete";

const router: IRouter = Router();

router.get(
  "/workspaces/:workspaceId/auto-complete/validate",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) { res.status(400).json({ error: "Invalid workspace ID" }); return; }

    const [ws] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!ws || ws.userId !== dbUser.id) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const result = await validateAutoCompletePrerequisites(workspaceId);
    res.json(result);
  },
);

router.post(
  "/workspaces/:workspaceId/auto-complete/cancel",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) { res.status(400).json({ error: "Invalid workspace ID" }); return; }

    const [ws] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!ws || ws.userId !== dbUser.id) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    requestAutoCompleteCancel(workspaceId);
    await db
      .update(workspacesTable)
      .set({ autoCompleteStatus: "cancelled", autoCompleteCurrentSection: null, updatedAt: new Date() })
      .where(eq(workspacesTable.id, workspaceId));

    res.json({ ok: true });
  },
);

router.post(
  "/workspaces/:workspaceId/auto-complete/stream",
  requireAuth,
  async (req, res): Promise<void> => {
    const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

    const workspaceId = parseInt(String(req.params.workspaceId), 10);
    if (isNaN(workspaceId)) { res.status(400).json({ error: "Invalid workspace ID" }); return; }

    const [ws] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .limit(1);

    if (!ws || ws.userId !== dbUser.id) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    await runThesisAutoComplete({
      workspaceId,
      userId: dbUser.id,
      onEvent: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
    });

    res.end();
  },
);

export default router;
