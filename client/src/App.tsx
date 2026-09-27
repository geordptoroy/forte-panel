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
} from "./pages/PanelPages";
import { ProfessionalsPage, ServicesPage } from "./pages/CatalogPage";
import { ProfessionalPortalPage } from "./pages/ProfessionalPortal";
import { SettingsTabsPage } from "./pages/SettingsTabs";
import TeamPage from "./pages/TeamPage";
import AccessGuard, { PlatformOnlyGuard } from "./components/AccessGuard";
import OnboardingPage from "./pages/OnboardingPage";
import AiConfigPage from "./pages/AiConfigPage";
import AiPromptPage from "./pages/AiPromptPage";
import BillingPage from "./pages/BillingPage";
import LoginPage from "./pages/LoginPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import {
  PlatformAdminHome,
  PlatformWorkspacePage,
} from "./pages/PlatformAdminPage";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/kanban" component={KanbanPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/invite/:token" component={InviteAcceptPage} />
      <Route path="/platform-admin" component={PlatformAdminHome} />
      <Route path="/platform-admin/workspaces" component={PlatformAdminHome} />
      <Route
        path="/platform-admin/workspaces/:id"
        component={PlatformWorkspacePage}
      />
      <Route path="/agenda">
        {() => (
          <AccessGuard requirement="fullAgenda" title="Agenda completa">
            <AgendaPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/contacts/:id" component={ContactDetailPage} />
      <Route path="/billing">
        {() => (
          <AccessGuard requirement="manager" title="Faturamento">
            <BillingPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/integrations">
        {() => (
          <AccessGuard requirement="manager" title="Integrações">
            <IntegrationsPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/onboarding">
        {() => (
          <PlatformOnlyGuard title="Configuração da empresa">
            <OnboardingPage />
          </PlatformOnlyGuard>
        )}
      </Route>
      <Route path="/ai-config">
        {() => (
          <PlatformOnlyGuard title="Configuração da IA">
            <AiConfigPage />
          </PlatformOnlyGuard>
        )}
      </Route>
      <Route path="/ai-prompt">
        {() => (
          <PlatformOnlyGuard title="Prompt do agente">
            <AiPromptPage />
          </PlatformOnlyGuard>
        )}
      </Route>
      <Route path="/team">
        {() => (
          <AccessGuard requirement="administrator" title="Equipe">
            <TeamPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/services">
        {() => (
          <AccessGuard requirement="manager" title="Serviços">
            <ServicesPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/professionals">
        {() => (
          <AccessGuard requirement="manager" title="Profissionais">
            <ProfessionalsPage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/my-work" component={ProfessionalPortalPage} />
      <Route path="/settings" component={SettingsTabsPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function AuthenticatedRouter() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });
  const [location] = useLocation();
  if (location === "/login") return <LoginPage />;
  if (location.startsWith("/invite/")) return <Router />;
  if (isLoading)
    return (
      <main className="auth-screen">
        <div className="auth-loading">Verificando acesso...</div>
      </main>
    );
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
