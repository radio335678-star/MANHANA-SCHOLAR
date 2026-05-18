import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/react";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import SignInPage from "@/pages/auth/sign-in";
import SignUpPage from "@/pages/auth/sign-up";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import WorkspacesList from "@/pages/workspaces";
import NewWorkspace from "@/pages/workspaces/new";
import WorkspaceDetail from "@/pages/workspaces/[id]";
import WorkspaceEditor from "@/pages/workspaces/[id]/editor";
import WorkspaceVault from "@/pages/workspaces/[id]/vault";
import Profile from "@/pages/profile";
import AdminDashboard from "@/pages/admin";

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY in environment variables");
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />

      <Route path="/onboarding" component={Onboarding} />

      <Route path="/dashboard">
        <ProtectedLayout><Dashboard /></ProtectedLayout>
      </Route>
      <Route path="/workspaces">
        <ProtectedLayout><WorkspacesList /></ProtectedLayout>
      </Route>
      <Route path="/workspaces/new">
        <ProtectedLayout><NewWorkspace /></ProtectedLayout>
      </Route>
      <Route path="/workspaces/:id">
        {params => <ProtectedLayout><WorkspaceDetail id={params.id} /></ProtectedLayout>}
      </Route>
      <Route path="/workspaces/:id/editor">
        {params => <ProtectedLayout><WorkspaceEditor id={params.id} /></ProtectedLayout>}
      </Route>
      <Route path="/workspaces/:id/vault">
        {params => <ProtectedLayout><WorkspaceVault id={params.id} /></ProtectedLayout>}
      </Route>
      <Route path="/profile">
        <ProtectedLayout><Profile /></ProtectedLayout>
      </Route>
      <Route path="/admin">
        <ProtectedLayout><AdminDashboard /></ProtectedLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
