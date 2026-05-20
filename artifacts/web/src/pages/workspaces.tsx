import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useListWorkspaces, getListWorkspacesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, BookOpen, Clock, Activity } from "lucide-react";
import { WorkspaceCardMenu } from "@/components/workspace/WorkspaceCardMenu";

export default function WorkspacesList() {
  const { userId } = useAuth();
  const [status, setStatus] = useState<"active" | "completed" | "archived" | "all">("all");

  const queryParams = status === "all" ? {} : { status };

  const { data: workspaces, isLoading } = useListWorkspaces(queryParams, {
    query: {
      enabled: !!userId,
      queryKey: getListWorkspacesQueryKey(queryParams)
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your theses and research projects.</p>
        </div>
        <Link href="/workspaces/new">
          <Button className="shrink-0 shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Workspace
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <Tabs value={status} onValueChange={(v: any) => setStatus(v)} className="w-[400px]">
          <TabsList className="grid w-full grid-cols-4 bg-secondary">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : workspaces && workspaces.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((workspace) => (
            <Card
              key={workspace.id}
              className="h-full flex flex-col hover-elevate border-border shadow-sm transition-all group relative"
            >
              <div className="absolute top-3 right-3 z-10">
                <WorkspaceCardMenu
                  workspaceId={workspace.id}
                  workspaceTitle={workspace.title}
                  status={workspace.status}
                />
              </div>
              <Link href={`/workspaces/${workspace.id}`} className="flex flex-col flex-1 min-h-0">
                <CardHeader className="pr-12">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <CardTitle className="font-serif text-lg leading-tight group-hover:text-primary transition-colors">
                        {workspace.title}
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-2">
                        <span className="font-medium text-foreground">{workspace.domain}</span>
                        {workspace.qualification && (
                          <>
                            <span>&bull;</span>
                            <span>{workspace.qualification}</span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span className="font-medium">{workspace.totalSections > 0 ? Math.round((workspace.completedSections / workspace.totalSections) * 100) : 0}%</span>
                    </div>
                    <Progress value={workspace.totalSections > 0 ? (workspace.completedSections / workspace.totalSections) * 100 : 0} className="h-1.5" />
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t border-border bg-secondary/10 flex justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    <span className="capitalize">{workspace.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{format(new Date(workspace.updatedAt), "MMM d, yyyy")}</span>
                  </div>
                </CardFooter>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 border border-dashed border-border rounded-lg bg-secondary/20">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-serif font-medium text-foreground mb-2">No workspaces found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            {status === "all" 
              ? "You haven't created any workspaces yet. Start your first research project." 
              : `You have no ${status} workspaces.`}
          </p>
          <Link href="/workspaces/new">
            <Button variant="outline" className="shadow-sm">Create Workspace</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
