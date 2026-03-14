import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import PomodoroPage from "@/pages/pomodoro";
import NotFound from "@/pages/not-found";

function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-8">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6">
          <svg className="h-8 w-8 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-3">Zen Focus Timer</h1>
        <p className="text-muted-foreground mb-8">
          Stay in the zone with AI-powered ambient soundscapes and a focused Pomodoro timer.
        </p>
        <a
          href="/api/login"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Sign in to get started
        </a>
      </div>
    </div>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Switch>
      <Route path="/">
        {user ? <PomodoroPage /> : <LandingPage />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="pomodoro-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
