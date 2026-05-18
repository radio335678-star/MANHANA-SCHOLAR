import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, BookOpen, MessageSquare, Activity, Database, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdminStats {
  users: { total: number; newThisWeek: number };
  workspaces: { total: number; active: number };
  sections: { total: number };
  ai: { totalMessages: number; totalTokensUsed: number };
  vault: { totalResources: number };
  recentEvents: Array<{
    id: number;
    type: string;
    description: string;
    createdAt: string;
  }>;
  recentUsers: Array<{
    id: number;
    email: string;
    fullName: string | null;
    domain: string | null;
    qualification: string | null;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load stats");
        const data = await res.json();
        setStats(data);
      } catch (e) {
        toast({ title: "Failed to load admin stats", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [getToken, toast]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">Failed to load admin dashboard.</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold">Platform Dashboard</h1>
        <p className="text-muted-foreground mt-1">MANTHANA-SCHOLER — Live platform analytics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.total}</div>
            <p className="text-xs text-muted-foreground mt-1">+{stats.users.newThisWeek} this week</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Workspaces</CardTitle>
            <BookOpen className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.workspaces.total}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.workspaces.active} active</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sections</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sections.total}</div>
            <p className="text-xs text-muted-foreground mt-1">total created</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">AI Messages</CardTitle>
            <MessageSquare className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ai.totalMessages}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(stats.ai.totalTokensUsed / 1000).toFixed(1)}K tokens
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Vault Resources</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.vault.totalResources}</div>
            <p className="text-xs text-muted-foreground mt-1">papers, notes, refs</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {stats.recentEvents.length > 0 ? (
                stats.recentEvents.map((event) => (
                  <div key={event.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{event.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(event.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">{event.type.replace("_", " ")}</Badge>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">No activity yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              Recent Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {stats.recentUsers.length > 0 ? (
                stats.recentUsers.map((user) => (
                  <div key={user.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
                      {(user.fullName ?? user.email)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.fullName ?? user.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {user.domain && (
                        <Badge variant="outline" className="text-xs mb-1">{user.domain}</Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(user.createdAt), "MMM d")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">No users yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
