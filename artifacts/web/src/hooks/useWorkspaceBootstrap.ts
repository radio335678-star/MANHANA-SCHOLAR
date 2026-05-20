import { useCallback } from "react";
import type { WorkspaceInput } from "@workspace/api-client-react";

export type BootstrapInput = {
  workspacePayload: WorkspaceInput;
  departmentId?: number;
  preThesisChecklist: Record<string, boolean>;
  researchNotes?: string;
  candidateName?: string;
  synopsisFile?: File | null;
  resourceFiles?: File[];
};

export type BootstrapResult = {
  workspaceId: number;
  workspaceTitle: string;
  jobId: number;
  warnings: string[];
};

export function useWorkspaceBootstrap(getToken: () => Promise<string | null>) {
  const runBootstrap = useCallback(
    async (input: BootstrapInput): Promise<BootstrapResult> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const warnings: string[] = [];

      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...input.workspacePayload,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          preThesisChecklist: input.preThesisChecklist,
          researchNotes: input.researchNotes?.trim() || undefined,
          candidateName: input.candidateName?.trim() || undefined,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "Failed to create workspace",
        );
      }
      const workspace = (await createRes.json()) as {
        id: number;
        title: string;
      };
      const workspaceId = workspace.id;

      const patchRes = await fetch(`/api/workspaces/${workspaceId}/pre-thesis`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          preThesisChecklist: input.preThesisChecklist,
          researchNotes: input.researchNotes?.trim() || undefined,
          candidateName: input.candidateName?.trim() || undefined,
        }),
      });
      if (!patchRes.ok) {
        warnings.push("Could not save pre-thesis checklist; you can update it later.");
      }

      if (input.synopsisFile) {
        const form = new FormData();
        form.append("file", input.synopsisFile);
        const synRes = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/synopsis`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!synRes.ok) {
          warnings.push("Synopsis upload failed; you can upload it in Pre-Thesis Setup.");
        }
      }

      for (const file of input.resourceFiles ?? []) {
        const form = new FormData();
        form.append("file", file);
        form.append("type", "paper");
        form.append("title", file.name.replace(/\.[^.]+$/, ""));
        const upRes = await fetch(`/api/workspaces/${workspaceId}/vault/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!upRes.ok) {
          warnings.push(`Could not upload "${file.name}" to Research Vault.`);
        }
      }

      const buildRes = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/build`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!buildRes.ok) {
        const err = await buildRes.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "Failed to start pre-thesis build",
        );
      }
      const { jobId } = (await buildRes.json()) as { jobId: number };

      return {
        workspaceId,
        workspaceTitle: workspace.title,
        jobId,
        warnings,
      };
    },
    [getToken],
  );

  const startBuildOnly = useCallback(
    async (workspaceId: number): Promise<number> => {
      const token = await getToken();
      const buildRes = await fetch(`/api/workspaces/${workspaceId}/pre-thesis/build`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!buildRes.ok) {
        throw new Error("Failed to start pre-thesis build");
      }
      const { jobId } = (await buildRes.json()) as { jobId: number };
      return jobId;
    },
    [getToken],
  );

  return { runBootstrap, startBuildOnly };
}
