import { useRoute, Link } from "wouter";
import { useAuth } from "@clerk/react";
import { format } from "date-fns";
import { 
  useGetWorkspace, 
  useGetWorkspaceProgress, 
  useGetVaultSummary, 
  useListSections,
  getGetWorkspaceQueryKey,
  getGetWorkspaceProgressQueryKey,
  getGetVaultSummaryQueryKey,
  getListSectionsQueryKey
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, PenTool, Database, Activity, FileText, LayoutList } from "lucide-react";

export default function WorkspaceDetail({ id }: { id: string }) {
  const workspaceId = parseInt(id, 10);
  const { userId } = useAuth();

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetWorkspaceQueryKey(workspaceId)
    }
  });

  const { data: progress, isLoading: isProgressLoading } = useGetWorkspaceProgress(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetWorkspaceProgressQueryKey(workspaceId)
    }
  });

  const { data: vaultSummary, isLoading: isVaultLoading } = useGetVaultSummary(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getGetVaultSummaryQueryKey(workspaceId)
    }
  });

  const { data: sections, isLoading: isSectionsLoading } = useListSections(workspaceId, {
    query: {
      enabled: !!workspaceId,
      queryKey: getListSectionsQueryKey(workspaceId)
    }
  });

  if (isWsLoading || isProgressLoading || isVaultLoading || isSectionsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workspace) {
    return <div className="p-8 text-center text-muted-foreground">Workspace not found</div>;
  }

  const completionPercent = progress ? progress.percentComplete : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground border border-border font-medium tracking-wide">
              {workspace.domain}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent-foreground border border-accent/20 font-medium tracking-wide capitalize">
              {workspace.status.replace("_", " ")}
            </span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground leading-tight">{workspace.title}</h1>
          {workspace.description && (
            <p className="text-muted-foreground max-w-3xl leading-relaxed">{workspace.description}</p>
          )}
          <div className="flex items-center gap-6 pt-2 text-sm text-muted-foreground">
            {workspace.guideName && <span className="flex items-center gap-1.5"><PenTool className="w-3.5 h-3.5" /> Guide: {workspace.guideName}</span>}
            <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Updated {format(new Date(workspace.updatedAt), "MMM d, yyyy")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Editor Entry Card */}
        <Card className="md:col-span-2 border-border shadow-sm bg-card hover:bg-secondary/10 transition-colors">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-xl font-serif">
                  <LayoutList className="w-5 h-5 text-primary" />
                  Manuscript Editor
                </CardTitle>
                <CardDescription>Write and manage your thesis sections with AI assistance</CardDescription>
              </div>
              <Link href={`/workspaces/${workspace.id}/editor`}>
                <Button size="lg" className="shadow-sm">Open Editor</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex justify-between items-end text-sm">
                <div>
                  <span className="font-medium text-foreground">{progress?.completedSections || 0}</span>
                  <span className="text-muted-foreground"> of {progress?.totalSections || 0} sections completed</span>
                </div>
                <span className="font-bold text-foreground">{completionPercent}%</span>
              </div>
              <Progress value={completionPercent} className="h-2" />
              
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="text-2xl font-serif font-medium text-muted-foreground">{progress?.notStartedSections || 0}</div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Not Started</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-accent/5 border border-accent/10">
                  <div className="text-2xl font-serif font-medium text-accent-foreground">{progress?.inProgressSections || 0}</div>
                  <div className="text-xs text-accent-foreground mt-1 uppercase tracking-wider">In Progress</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="text-2xl font-serif font-medium text-primary">{progress?.completedSections || 0}</div>
                  <div className="text-xs text-primary mt-1 uppercase tracking-wider">Completed</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vault Entry Card */}
        <Card className="border-border shadow-sm bg-card hover:bg-secondary/10 transition-colors flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-serif">
              <Database className="w-5 h-5 text-accent" />
              Research Vault
            </CardTitle>
            <CardDescription>Manage papers, notes, and references</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-2xl font-serif font-bold text-foreground">{vaultSummary?.total || 0}</span>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between w-full min-w-[120px]">
                  <span>Papers</span>
                  <span className="font-medium text-foreground">{vaultSummary?.byType?.paper || 0}</span>
                </div>
                <div className="flex justify-between w-full">
                  <span>Notes</span>
                  <span className="font-medium text-foreground">{vaultSummary?.byType?.note || 0}</span>
                </div>
                <div className="flex justify-between w-full">
                  <span>Refs</span>
                  <span className="font-medium text-foreground">{vaultSummary?.byType?.reference || 0}</span>
                </div>
              </div>
            </div>
          </CardContent>
          <div className="p-6 pt-0 mt-auto">
            <Link href={`/workspaces/${workspace.id}/vault`}>
              <Button variant="outline" className="w-full shadow-sm bg-background">Open Vault</Button>
            </Link>
          </div>
        </Card>

      </div>

      {/* Sections Overview */}
      <div className="space-y-4">
        <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">Sections Overview</h2>
        <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden divide-y divide-border">
          {sections && sections.length > 0 ? (
            sections.map((section) => (
              <div key={section.id} className="p-4 flex items-center justify-between hover:bg-secondary/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    section.status === 'completed' ? 'bg-primary' : 
                    section.status === 'in_progress' ? 'bg-accent' : 'bg-muted-foreground/30'
                  }`} />
                  <span className="font-medium text-foreground">{section.title}</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="capitalize w-24 text-right">{section.status.replace("_", " ")}</span>
                  <span className="w-20 text-right">{section.wordCount || 0} words</span>
                  <Link href={`/workspaces/${workspace.id}/editor?section=${section.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 text-primary">Edit</Button>
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No sections created yet. Open the editor to start writing.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
