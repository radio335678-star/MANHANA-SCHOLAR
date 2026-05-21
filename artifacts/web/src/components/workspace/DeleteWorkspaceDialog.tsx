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

  const deleteWorkspace = useDeleteWorkspace();

  const handleDelete = () => {
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
            <p className="text-left text-sm text-muted-foreground">
              This will permanently delete <strong className="text-foreground">{workspaceTitle}</strong>,
              including sections, vault resources, pre-thesis data, and exports. This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteWorkspace.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleteWorkspace.isPending}
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
