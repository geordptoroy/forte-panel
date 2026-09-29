import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { trpc } from "./lib/trpc";
import {
  CORE_ONLY_MODE,
  CORE_ROUTE,
  CORE_USAGE_ROUTE,
  isCoreAllowedRoute,
} from "./core-mode";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  AgendaPage,
  ContactDetailPage,
  ContactsPage,
  DashboardPage,
  InboxPage,
  IntegrationsPage,
  WhatsappConnectionPage,
  WorkspaceUsagePage,
  KanbanPage,
  NotFoundPage,
} from "./pages/PanelPages";
import { ProfessionalsPage, ServicesPage } from "./pages/CatalogPage";
import { ProfessionalPortalPage } from "./pages/ProfessionalPortal";
import { SettingsTabsPage } from "./pages/SettingsTabs";
import TeamPage from "./pages/TeamPage";
import AccessGuard, {
  OnboardingGuard,
  PlatformOnlyGuard,
} from "./components/AccessGuard";
import OnboardingPage from "./pages/OnboardingPage";
import AiPromptPage from "./pages/AiPromptPage";
import BillingPage from "./pages/BillingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import {
  PlatformAdminHome,
  PlatformAuditPage,
  PlatformGlobalAiPage,
  PlatformPromptsPage,
  PlatformSupportPage,
  PlatformWorkspacePage,
} from "./pages/PlatformAdminPage";
import { PlatformSupportInstancesPage } from "./pages/PlatformSupportInstancesPage";

function Router() {
  const [location] = useLocation();
  if (
    CORE_ONLY_MODE &&
    !isCoreAllowedRoute(location) &&
    !location.startsWith("/invite/")
  )
    return <Redirect to={CORE_ROUTE} />;
  return (
    <Switch>
      <Route path="/">
        <Redirect to={CORE_ONLY_MODE ? CORE_ROUTE : "/dashboard"} />
      </Route>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/whatsapp-connection">
        {() => (
          <AccessGuard requirement="manager" title="Conectar WhatsApp">
            <WhatsappConnectionPage />
          </AccessGuard>
        )}
      </Route>
      <Route path={CORE_USAGE_ROUTE}>
        {() => (
          <AccessGuard requirement="manager" title="Planos e consumo">
            <WorkspaceUsagePage />
          </AccessGuard>
        )}
      </Route>
      <Route path="/inbox">
        {() => <InboxPage />}
      </Route>
      <Route path="/kanban" component={KanbanPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/invite/:token" component={InviteAcceptPage} />
      <Route path="/platform-admin" component={PlatformAdminHome} />
      <Route path="/platform-admin/workspaces" component={PlatformAdminHome} />
      <Route path="/platform-admin/ai" component={PlatformGlobalAiPage} />
      <Route path="/platform-admin/prompts" component={PlatformPromptsPage} />
      <Route path="/platform-admin/support" component={PlatformSupportPage} />
      <Route path="/platform-admin/support-instances" component={PlatformSupportInstancesPage} />
      <Route path="/platform-admin/support-inbox">
        {() => <InboxPage platformAdmin />}
      </Route>
      <Route path="/platform-admin/audit" component={PlatformAuditPage} />
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
          <AccessGuard requirement="financial" title="Faturamento">
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
          <OnboardingGuard title="Configuração da empresa">
            <OnboardingPage />
          </OnboardingGuard>
        )}
      </Route>
      <Route path="/ai-config">
        {() => <Redirect to="/platform-admin/ai" />}
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
  if (location === "/signup") return <SignupPage />;
  if (location === "/forgot-password") return <ForgotPasswordPage />;
  if (location.startsWith("/reset-password")) return <ResetPasswordPage />;
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
