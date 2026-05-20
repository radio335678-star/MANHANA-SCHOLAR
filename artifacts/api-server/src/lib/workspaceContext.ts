import { db } from "@workspace/db";
import { workspacesTable } from "@workspace/db";
import { eq } from "@workspace/db";
import type { VaultCitationCatalog } from "@workspace/vault-citations";
import { isAtLeastLocked, isWorkflowState } from "../types/workflow";
import { buildAiContextBlock } from "./buildAiContextBlock";
import { loadVaultAiContext } from "./loadVaultForAi";

export type WorkspaceAiContext = {
  locked: boolean;
  workflowState: string;
  contextBlock: string;
  vaultBlock: string;
  vaultCatalog: VaultCitationCatalog;
  vaultResourceCount: number;
};

export async function getWorkspaceAiContext(workspaceId: number): Promise<WorkspaceAiContext> {
  const [ws] = await db
    .select({
      workflowState: workspacesTable.workflowState,
      preThesisLockedMd: workspacesTable.preThesisLockedMd,
      researchNotes: workspacesTable.researchNotes,
    })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);

  const vaultCtx = await loadVaultAiContext(workspaceId);

  if (!ws) {
    return {
      locked: false,
      workflowState: "init",
      contextBlock: "",
      vaultBlock: vaultCtx.vaultBlock,
      vaultCatalog: vaultCtx.catalog,
      vaultResourceCount: vaultCtx.resourceCount,
    };
  }

  const state = isWorkflowState(ws.workflowState) ? ws.workflowState : "init";
  const locked = isAtLeastLocked(state) && Boolean(ws.preThesisLockedMd?.trim());

  if (!locked) {
    return {
      locked: false,
      workflowState: state,
      contextBlock: "",
      vaultBlock: vaultCtx.vaultBlock,
      vaultCatalog: vaultCtx.catalog,
      vaultResourceCount: vaultCtx.resourceCount,
    };
  }

  const preThesisBlock = buildAiContextBlock(ws.preThesisLockedMd ?? "", ws.researchNotes);
  const contextBlock = [preThesisBlock, vaultCtx.vaultBlock].filter(Boolean).join("\n\n");

  return {
    locked: true,
    workflowState: state,
    contextBlock,
    vaultBlock: vaultCtx.vaultBlock,
    vaultCatalog: vaultCtx.catalog,
    vaultResourceCount: vaultCtx.resourceCount,
  };
}

export async function assertAiAllowed(workspaceId: number): Promise<void> {
  const { locked, workflowState } = await getWorkspaceAiContext(workspaceId);
  if (!locked) {
    throw new Error(
      `AI writing requires locked pre-thesis setup. Current workflow state: ${workflowState}. Complete Pre-Thesis Setup and lock-in first.`,
    );
  }
}
