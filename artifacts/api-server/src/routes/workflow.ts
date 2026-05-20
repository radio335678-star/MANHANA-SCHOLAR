import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { workspacesTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { requireAuth, requireDbUser } from "../lib/auth";
import {
  getAllowedTransitions,
  transitionWorkflow,
  WorkflowTransitionError,
} from "../services/workflowState";
import { isWorkflowState } from "../types/workflow";
import { z } from "zod";

const router: IRouter = Router();

const TransitionBody = z.object({
  targetState: z.enum([
    "init",
    "pre_setup",
    "locked_in",
    "section_build",
    "review",
    "complete",
    "archived",
  ]),
  reason: z.string().optional(),
  unlockConfirmed: z.boolean().optional(),
});

async function verifyOwnership(workspaceId: number, userId: number) {
  const [ws] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws || ws.userId !== userId) return null;
  return ws;
}

router.get("/workspaces/:id/workflow", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

      const workspaceId = parseInt(String(req.params.id), 10);
  if (isNaN(workspaceId)) {
    res.status(400).json({ error: "Invalid workspace ID" });
    return;
  }

  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const current = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  const allowedTransitions = await getAllowedTransitions(workspaceId);

  res.json({
    workspaceId,
    currentState: current,
    allowedTransitions,
    locked: Boolean(ws.preThesisMdHash),
  });
});

router.post("/workspaces/:id/workflow/transition", requireAuth, async (req, res): Promise<void> => {
  const dbUser = await requireDbUser(req, res);
    if (!dbUser) return;

      const workspaceId = parseInt(String(req.params.id), 10);
  if (isNaN(workspaceId)) {
    res.status(400).json({ error: "Invalid workspace ID" });
    return;
  }

  const parsed = TransitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ws = await verifyOwnership(workspaceId, dbUser.id);
  if (!ws) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  try {
    const newState = await transitionWorkflow(
      workspaceId,
      dbUser.id,
      parsed.data.targetState,
      {
        reason: parsed.data.reason,
        unlockConfirmed: parsed.data.unlockConfirmed,
      },
    );
    res.json({ workspaceId, workflowState: newState });
  } catch (err) {
    if (err instanceof WorkflowTransitionError) {
      res.status(409).json({
        error: err.message,
        code: err.code,
        from: err.from,
        to: err.to,
      });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Transition failed" });
  }
});

export default router;
