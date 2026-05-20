import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeleteWorkspace,
  getListWorkspacesQueryKey,
} from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type DeleteWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  workspaceTitle: string;
  /** Navigate to /workspaces after delete (e.g. when deleting from detail page). */
  redirectAfterDelete?: boolean;
};

export function invalidateWorkspaceListQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: getListWorkspacesQueryKey() });
}

export function DeleteWorkspaceDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceTitle,
  redirectAfterDelete = false,
}: DeleteWorkspaceDialogProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmTitle, setConfirmTitle] = useState("");

  const deleteWorkspace = useDeleteWorkspace();

  useEffect(() => {
    if (!open) {
      setConfirmTitle("");
    }
  }, [open]);

  const titleMatches =
    confirmTitle.trim().toLowerCase() === workspaceTitle.trim().toLowerCase();

  const handleDelete = () => {
    if (!titleMatches) return;

    deleteWorkspace.mutate(
      { id: workspaceId },
      {
        onSuccess: () => {
          invalidateWorkspaceListQueries(queryClient);
          queryClient.removeQueries({
            queryKey: [`/api/workspaces/${workspaceId}`],
          });
          onOpenChange(false);
          toast({
            title: "Workspace deleted",
            description: `"${workspaceTitle}" and all related data were removed.`,
          });
          if (redirectAfterDelete) {
            setLocation("/workspaces");
          }
        },
        onError: () => {
          toast({
            title: "Could not delete workspace",
            description: "Please try again. If the problem persists, contact support.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workspace permanently?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                This will permanently delete <strong className="text-foreground">{workspaceTitle}</strong>,
                including sections, vault resources, pre-thesis data, and exports. This action cannot be undone.
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-workspace-confirm" className="text-foreground">
                  Type the workspace title to confirm
                </Label>
                <Input
                  id="delete-workspace-confirm"
                  value={confirmTitle}
                  onChange={(e) => setConfirmTitle(e.target.value)}
                  placeholder={workspaceTitle}
                  autoComplete="off"
                  disabled={deleteWorkspace.isPending}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteWorkspace.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!titleMatches || deleteWorkspace.isPending}
            onClick={handleDelete}
          >
            {deleteWorkspace.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete workspace"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
