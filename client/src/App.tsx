import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  AgendaPage,
  BillingPage,
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
      <Route path="/team" component={TeamPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-right" theme="dark" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
