import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useLocation, Link } from "wouter";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Loader2, BookOpen, LayoutDashboard, FileText, UserCircle } from "lucide-react";

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useGetProfile({
    query: {
      enabled: !!userId,
      queryKey: getGetProfileQueryKey(),
      retry: false
    }
  });

  useEffect(() => {
    if (isLoaded && !userId) {
      setLocation("/sign-in");
    }
  }, [isLoaded, userId, setLocation]);

  useEffect(() => {
    if (isLoaded && userId && !isProfileLoading) {
      if (isProfileError || !profile?.onboardingComplete) {
        setLocation("/onboarding");
      }
    }
  }, [isLoaded, userId, isProfileLoading, isProfileError, profile, setLocation]);

  if (!isLoaded || !userId || isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-serif font-bold text-lg tracking-tight">MANTHANA</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-card-foreground hover:bg-secondary transition-colors">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link href="/workspaces" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-card-foreground hover:bg-secondary transition-colors">
            <FileText className="w-4 h-4" />
            Workspaces
          </Link>
        </nav>
        <div className="p-4 border-t border-border">
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors">
            <UserCircle className="w-4 h-4" />
            Profile Settings
          </Link>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
