export type ReleaseState =
  | "public_ready"
  | "internal_only"
  | "simulation_only"
  | "not_ready";

export type ReleaseSurface = {
  state: ReleaseState;
  title: string;
  reason: string;
  /** Exposição temporária durante a entrega incremental do núcleo operacional. */
  enabledInCore: boolean;
};

const routeCatalog: Record<string, ReleaseSurface> = {
  "/login": {
    state: "public_ready",
    title: "Login",
    reason: "Autenticação pública disponível.",
    enabledInCore: true,
  },
  "/signup": {
    state: "public_ready",
    title: "Cadastro",
    reason: "Cadastro público cria conta e workspace reais.",
    enabledInCore: true,
  },
  "/forgot-password": {
    state: "public_ready",
    title: "Recuperação de acesso",
    reason: "Fluxo público de recuperação disponível.",
    enabledInCore: true,
  },
  "/reset-password": {
    state: "public_ready",
    title: "Redefinição de senha",
    reason: "Fluxo público de redefinição disponível.",
    enabledInCore: true,
  },
  "/invite/:token": {
    state: "public_ready",
    title: "Convite",
    reason: "Aceitação de convite cria membership real.",
    enabledInCore: true,
  },
  "/whatsapp-connection": {
    state: "not_ready",
    title: "Conexão WhatsApp",
    reason:
      "É o primeiro fluxo operacional; ainda depende de prova completa de conexão, reconexão e envio.",
    enabledInCore: true,
  },
  "/inbox": {
    state: "not_ready",
    title: "Inbox",
    reason:
      "É o núcleo de atendimento; assignment, unread e prova de mensagem real ainda estão em fechamento.",
    enabledInCore: true,
  },
  "/plans-usage": {
    state: "not_ready",
    title: "Planos e consumo",
    reason:
      "A superfície de consumo ainda não está liberada durante a contenção do núcleo.",
    enabledInCore: false,
  },
  "/platform-admin": {
    state: "internal_only",
    title: "Console Admin",
    reason: "Control-plane interno da operação da plataforma.",
    enabledInCore: true,
  },
  "/ai-config": {
    state: "internal_only",
    title: "Configuração de IA",
    reason: "Governança técnica interna, sem exposição ao cliente final.",
    enabledInCore: false,
  },
  "/ai-prompt": {
    state: "internal_only",
    title: "Prompt do agente",
    reason: "Governança técnica interna, sem exposição ao cliente final.",
    enabledInCore: false,
  },
  "/kanban": {
    state: "not_ready",
    title: "Funil de atendimento",
    reason:
      "Precisa consolidar estágios, lead e próxima ação com o núcleo comercial.",
    enabledInCore: false,
  },
  "/dashboard": {
    state: "not_ready",
    title: "Dashboard",
    reason:
      "KPIs de operação e receita ainda precisam ser fechados com dados reais.",
    enabledInCore: false,
  },
  "/agenda": {
    state: "not_ready",
    title: "Agenda",
    reason:
      "Disponibilidade, conflitos, confirmação, conclusão e no-show ainda estão em fechamento.",
    enabledInCore: false,
  },
  "/contacts": {
    state: "not_ready",
    title: "Clientes e contatos",
    reason:
      "O ciclo comercial do lead ainda precisa ser consolidado nesta superfície.",
    enabledInCore: false,
  },
  "/billing": {
    state: "not_ready",
    title: "Orçamentos e pagamentos",
    reason:
      "Itens, condições, recibo e conciliação ainda precisam ser fechados.",
    enabledInCore: false,
  },
  "/integrations": {
    state: "not_ready",
    title: "Integrações",
    reason: "A superfície de integrações do cliente ainda está em fechamento.",
    enabledInCore: false,
  },
  "/onboarding": {
    state: "not_ready",
    title: "Configuração da empresa",
    reason:
      "O onboarding público ainda precisa ser simplificado para a jornada final.",
    enabledInCore: true,
  },
  "/team": {
    state: "not_ready",
    title: "Equipe",
    reason:
      "Papéis, revogação e onboarding da equipe ainda precisam de validação completa.",
    enabledInCore: false,
  },
  "/services": {
    state: "not_ready",
    title: "Serviços",
    reason:
      "Catálogo, preço, duração e disponibilidade ainda precisam fechar o núcleo comercial.",
    enabledInCore: false,
  },
  "/professionals": {
    state: "not_ready",
    title: "Profissionais",
    reason:
      "Capacidade, serviços e agenda do executor ainda precisam de validação completa.",
    enabledInCore: false,
  },
  "/my-work": {
    state: "not_ready",
    title: "Minha agenda",
    reason:
      "O isolamento do profissional e a atualização de status ainda precisam ser provados.",
    enabledInCore: false,
  },
  "/settings": {
    state: "not_ready",
    title: "Preferências",
    reason:
      "Configurações do cliente ainda precisam ser separadas da governança interna.",
    enabledInCore: false,
  },
};

export const CORE_NAV_ROUTES = [
  "/onboarding",
  "/whatsapp-connection",
  "/inbox",
] as const;

function stripQuery(pathname: string) {
  return pathname.split("?", 1)[0]!.split("#", 1)[0]! || "/";
}

function matchesCatalogRoute(pathname: string, route: string) {
  if (route === "/platform-admin")
    return pathname === route || pathname.startsWith(`${route}/`);
  if (route === "/invite/:token") return pathname.startsWith("/invite/");
  if (route === "/contacts")
    return pathname === route || pathname.startsWith(`${route}/`);
  if (route === "/reset-password")
    return pathname === route || pathname.startsWith(`${route}/`);
  return pathname === route;
}

export function getRouteRelease(pathname: string): ReleaseSurface {
  const cleanPath = stripQuery(pathname);
  const entry = Object.entries(routeCatalog).find(([route]) =>
    matchesCatalogRoute(cleanPath, route)
  );
  return (
    entry?.[1] ?? {
      state: "not_ready",
      title: "Rota não catalogada",
      reason: "A rota precisa ser classificada antes de ser exposta.",
      enabledInCore: false,
    }
  );
}

export function isCoreRoute(pathname: string) {
  const cleanPath = stripQuery(pathname);
  return CORE_NAV_ROUTES.includes(
    cleanPath as (typeof CORE_NAV_ROUTES)[number]
  );
}

export function isRouteEnabledInCore(pathname: string) {
  const cleanPath = stripQuery(pathname);
  if (
    cleanPath === "/platform-admin" ||
    cleanPath.startsWith("/platform-admin/")
  )
    return true;
  return getRouteRelease(cleanPath).enabledInCore;
}

export function getReleaseCatalog() {
  return { ...routeCatalog };
}
