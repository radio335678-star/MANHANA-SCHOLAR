/** Free Scholar tier — active workspace cap (production default until billing is wired). */
export const FREE_TIER_ACTIVE_WORKSPACE_LIMIT = 2;

export function workspaceLimitError(limit: number) {
  return {
    error: `Your plan allows up to ${limit} active workspaces. Archive or delete one to create another.`,
    code: "WORKSPACE_LIMIT_REACHED" as const,
    limit,
  };
}
