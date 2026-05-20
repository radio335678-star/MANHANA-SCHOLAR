import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitialSidebarOpen } from "@/lib/sidebar-prefs";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { SidebarRouteSync } from "@/components/layout/SidebarRouteSync";

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useGetProfile({
    query: {
      enabled: !!userId,
      queryKey: getGetProfileQueryKey(),
      retry: false,
    },
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
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isFullBleed = location.includes("/editor");

  return (
    <SidebarProvider defaultOpen={getInitialSidebarOpen()}>
      <SidebarRouteSync />
      <AppSidebar />
      <SidebarInset className="flex min-h-svh flex-col">
        {!isFullBleed && <AppHeader />}
        <div
          className={cn(
            "flex flex-1 flex-col min-h-0",
            isFullBleed ? "overflow-hidden" : "overflow-y-auto p-4 md:p-6 lg:p-8"
          )}
        >
          {children}
        </div>
        {/* Floating trigger on editor — header is hidden there for max space */}
        {isFullBleed && (
          <div className="pointer-events-none fixed left-3 top-3 z-30 hidden md:block">
            <SidebarTrigger className="pointer-events-auto h-9 w-9 border border-border bg-card/95 shadow-sm backdrop-blur" />
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
