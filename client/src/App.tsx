import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { trpc } from "./lib/trpc";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  AgendaPage,
  ContactDetailPage,
  ContactsPage,
  DashboardPage,
  InboxPage,
  IntegrationsPage,
  KanbanPage,
  NotFoundPage,
  SettingsPage,
  TeamPage,
} from "./pages/PanelPages";
import OnboardingPage from "./pages/OnboardingPage";
import BillingPage from "./pages/BillingPage";
import LoginPage from "./pages/LoginPage";

function Router() {
  return (
    <Switch>
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/kanban" component={KanbanPage} />
      <Route path="/agenda" component={AgendaPage} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/contacts/:id" component={ContactDetailPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/team" component={TeamPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function AuthenticatedRouter() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const [location] = useLocation();
  if (location === "/login") return <LoginPage />;
  if (isLoading) return <main className="auth-screen"><div className="auth-loading">Verificando acesso...</div></main>;
  if (!user) return <Redirect to="/login" />;
  return <Router />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-right" theme="dark" richColors />
          <AuthenticatedRouter />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
