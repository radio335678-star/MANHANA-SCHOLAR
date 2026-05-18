import { useGetDashboardSummary, useGetDashboardActivity, getGetDashboardSummaryQueryKey, getGetDashboardActivityQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Clock, FileText, Activity, Plus } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { userId } = useAuth();
  
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: {
      enabled: !!userId,
      queryKey: getGetDashboardSummaryQueryKey()
    }
  });

  const { data: activity, isLoading: isActivityLoading } = useGetDashboardActivity({ limit: 10 }, {
    query: {
      enabled: !!userId,
      queryKey: getGetDashboardActivityQueryKey({ limit: 10 })
    }
  });

  if (isSummaryLoading || isActivityLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const completionPercentage = summary && summary.totalSections > 0 
    ? Math.round((summary.completedSections / summary.totalSections) * 100) 
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Scholar Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">Your academic workspace overview.</p>
        </div>
        <Link href="/workspaces/new">
          <Button className="shrink-0 shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Workspace
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Workspaces</CardTitle>
            <BookOpen className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeWorkspaces || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of {summary?.totalWorkspaces || 0} total</p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vault Resources</CardTitle>
            <FileText className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalVaultResources || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Papers, notes, references</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Progress</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-2">
              <div className="text-2xl font-bold">{completionPercentage}%</div>
              <div className="flex-1">
                <Progress value={completionPercentage} className="h-2" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{summary?.completedSections || 0} of {summary?.totalSections || 0} sections completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">Recent Workspaces</h2>
          {summary?.recentWorkspaces && summary.recentWorkspaces.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {summary.recentWorkspaces.map(ws => (
                <Link key={ws.id} href={`/workspaces/${ws.id}`}>
                  <Card className="hover-elevate cursor-pointer border-border shadow-sm transition-all h-full">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="text-lg font-serif line-clamp-2">{ws.title}</CardTitle>
                        <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground shrink-0 border border-border">
                          {ws.domain}
                        </span>
                      </div>
                      {ws.description && (
                        <CardDescription className="line-clamp-2 mt-2">{ws.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {ws.completedSections}/{ws.totalSections}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(ws.updatedAt), "MMM d")}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-border rounded-lg bg-secondary/20">
              <p className="text-muted-foreground mb-4">No workspaces yet.</p>
              <Link href="/workspaces/new">
                <Button variant="outline">Create your first workspace</Button>
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">Recent Activity</h2>
          <Card className="border-border shadow-sm">
            <CardContent className="p-0">
              {activity && activity.length > 0 ? (
                <div className="divide-y divide-border">
                  {activity.map(event => (
                    <div key={event.id} className="p-4 flex gap-4">
                      <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.createdAt), "MMM d, h:mm a")}
                          </span>
                          {event.workspaceTitle && (
                            <>
                              <span className="text-muted-foreground text-xs">•</span>
                              <span className="text-xs text-primary truncate max-w-[120px]">{event.workspaceTitle}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No recent activity.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
