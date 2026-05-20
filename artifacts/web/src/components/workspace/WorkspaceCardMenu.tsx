import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateWorkspace } from "@workspace/api-client-react";
import { Archive, Loader2, MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  DeleteWorkspaceDialog,
  invalidateWorkspaceListQueries,
} from "@/components/workspace/DeleteWorkspaceDialog";

type WorkspaceCardMenuProps = {
  workspaceId: number;
  workspaceTitle: string;
  status: string;
  redirectAfterDelete?: boolean;
  /** Show the trigger without requiring card hover (e.g. on detail page). */
  alwaysVisible?: boolean;
};

export function WorkspaceCardMenu({
  workspaceId,
  workspaceTitle,
  status,
  redirectAfterDelete = false,
  alwaysVisible = false,
}: WorkspaceCardMenuProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateWorkspace = useUpdateWorkspace();

  const handleArchive = () => {
    if (status === "archived") return;

    updateWorkspace.mutate(
      { id: workspaceId, data: { status: "archived" } },
      {
        onSuccess: () => {
          invalidateWorkspaceListQueries(queryClient);
          toast({
            title: "Workspace archived",
            description: `"${workspaceTitle}" was moved to Archived.`,
          });
        },
        onError: () => {
          toast({
            title: "Could not archive workspace",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={
              alwaysVisible
                ? "h-8 w-8 shrink-0"
                : "h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label={`Actions for ${workspaceTitle}`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {status !== "archived" && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleArchive();
              }}
              disabled={updateWorkspace.isPending}
            >
              {updateWorkspace.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteWorkspaceDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workspaceId={workspaceId}
        workspaceTitle={workspaceTitle}
        redirectAfterDelete={redirectAfterDelete}
      />
    </>
  );
}
