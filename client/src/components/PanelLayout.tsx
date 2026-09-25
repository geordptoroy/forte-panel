import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ContactRound,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Scissors,
  Settings,
  UserCog,
  X,
} from "lucide-react";

type NavItem = { href: string; label: string; description: string; icon: typeof BarChart3 };
type NavGroup = { label: string; items: NavItem[] };

const managementNav: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", description: "Visão geral", icon: LayoutDashboard },
      { href: "/inbox", label: "Atendimento", description: "Conversas com clientes", icon: Inbox },
      { href: "/kanban", label: "Funil de atendimento", description: "Etapas dos clientes", icon: KanbanSquare },
      { href: "/agenda", label: "Agenda", description: "Visitas e horários", icon: CalendarDays },
      { href: "/my-work", label: "Minha agenda", description: "Atendimentos do dia", icon: ClipboardList },
    ],
  },
  {
    label: "Clientes",
    items: [{ href: "/contacts", label: "Clientes e contatos", description: "Cadastro e histórico", icon: ContactRound }],
  },
  {
    label: "Financeiro",
    items: [{ href: "/billing", label: "Orçamentos e pagamentos", description: "Valores e recebimentos", icon: CircleDollarSign }],
  },
  {
    label: "Sistema",
    items: [
      { href: "/integrations", label: "Canais conectados", description: "WhatsApp e serviços externos", icon: PlugZap },
      { href: "/onboarding", label: "Configuração da empresa", description: "Regras do atendimento e IA", icon: BrainCircuit },
      { href: "/team", label: "Equipe", description: "Acessos e permissões", icon: UserCog },
      { href: "/services", label: "Serviços", description: "Catálogo executável", icon: Scissors },
      { href: "/professionals", label: "Profissionais", description: "Executores e jornada", icon: UserCog },
      { href: "/settings", label: "Preferências", description: "Preferências do painel", icon: Settings },
    ],
  },
];

const professionalNav: NavGroup[] = [
  {
    label: "Minha operação",
    items: [
      { href: "/my-work", label: "Meu dia", description: "Atendimentos de hoje", icon: ClipboardList },
      { href: "/my-work?view=semana", label: "Minha semana", description: "Planejamento semanal", icon: CalendarDays },
      { href: "/my-work?view=mes", label: "Minha agenda", description: "Visão mensal", icon: CalendarDays },
    ],
  },
  {
    label: "Meus clientes",
    items: [{ href: "/my-work?view=clientes", label: "Clientes", description: "Atendimentos atribuídos", icon: ContactRound }],
  },
  {
    label: "Perfil",
    items: [{ href: "/settings", label: "Perfil e disponibilidade", description: "Seus horários de trabalho", icon: Settings }],
  },
];

const attendantNav: NavGroup[] = [
  {
    label: "Atendimento",
    items: [
      { href: "/inbox", label: "Atendimento", description: "Conversas com clientes", icon: Inbox },
      { href: "/contacts", label: "Clientes e contatos", description: "Cadastro e histórico", icon: ContactRound },
      { href: "/kanban", label: "Funil de atendimento", description: "Etapas dos clientes", icon: KanbanSquare },
      { href: "/my-work", label: "Minhas tarefas", description: "Pendências atribuídas", icon: ClipboardList },
    ],
  },
  {
    label: "Perfil",
    items: [{ href: "/settings", label: "Preferências", description: "Preferências da conta", icon: Settings }],
  },
];

type PanelLayoutProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
};

const LOGO_URL = "https://img.icons8.com/comic/100/skull.png";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`brand-block ${collapsed ? "is-collapsed" : ""}`}>
      <div className="brand-mark"><img src={LOGO_URL} alt="Forte Media" /></div>
      {!collapsed && (
        <div className="brand-copy">
          <span>FORTE<span className="brand-muted">MEDIA</span></span>
        </div>
      )}
    </div>
  );
}

type AccessProfile = {
  role?: string;
  operationalRole?: string;
  canSeeFullAgenda?: boolean;
  restrictedToOwnAgenda?: boolean;
  memberActive?: boolean;
  professionalName?: string | null;
} | null | undefined;

function navForAccess(access: AccessProfile): NavGroup[] {
  if (!access) return managementNav;
  if (access.canSeeFullAgenda) return managementNav;
  if (access.operationalRole === "professional") return professionalNav;
  return attendantNav;
}

function accessLabel(access: AccessProfile) {
  if (!access) return "Operador";
  const roleLabels: Record<string, string> = { owner: "Proprietário", admin: "Administrador", manager: "Gerente", agent: "Atendente" };
  const operationalLabels: Record<string, string> = { human_attendant: "Atendimento humano", ai_attendant: "Atendimento IA", professional: "Profissional executor" };
  return `${roleLabels[access.role ?? "agent"] ?? "Operador"} · ${operationalLabels[access.operationalRole ?? "human_attendant"] ?? ""}`.trim();
}

function initialsOf(value: string | null | undefined) {
  if (!value) return "FP";
  return value.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function Sidebar({ collapsed, onToggle, onNavigate, access, unreadCount }: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  access: AccessProfile;
  unreadCount: number;
}) {
  const [location] = useLocation();
  const groups = navForAccess(access);
  return (
    <aside className={`panel-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="sidebar-topline">
        <Brand collapsed={collapsed} />
        <button className="icon-button collapse-button" onClick={onToggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <div className="sidebar-status">
        <span className="live-dot" />
        {!collapsed && <span>{access?.restrictedToOwnAgenda ? "Portal do profissional" : "Operação online"}</span>}
      </div>
      <nav className="panel-nav" aria-label="Navegação principal">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            {!collapsed && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => {
              const baseHref = item.href.split("?")[0];
              const active = location === baseHref || (baseHref === "/contacts" && location.startsWith("/contacts/"));
              const Icon = item.icon;
              return (
                <Link href={item.href} key={item.href} onClick={onNavigate}>
                  <span className={`nav-item ${active ? "is-active" : ""}`} title={collapsed ? item.label : undefined}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 1.8} />
                    {!collapsed && <span className="nav-item-copy"><strong>{item.label}</strong><small>{item.description}</small></span>}
                    {!collapsed && baseHref === "/inbox" && unreadCount > 0 && <em>{unreadCount}</em>}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="profile-row">
          <div className="profile-avatar">{initialsOf(access?.professionalName ?? undefined)}</div>
          {!collapsed && <div className="profile-copy"><strong>{access?.professionalName ?? "Administrador"}</strong><small>{accessLabel(access)}</small></div>}
        </div>
        {!collapsed && <div className="sidebar-version">FORTE PANEL <span>Operacional</span></div>}
      </div>
    </aside>
  );
}

export default function PanelLayout({ children, eyebrow = "Operação", title = "Dashboard", description, actions }: PanelLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [location] = useLocation();
  const { data: workspace } = trpc.workspace.current.useQuery();
  const { data: access } = trpc.auth.access.useQuery();
  const { data: inboxContacts } = trpc.inbox.contacts.useQuery(undefined, { enabled: Boolean(access?.canSeeFullAgenda) });
  const notificationsQuery = trpc.workspace.inAppNotifications.useQuery(undefined, {
    enabled: access?.memberActive === true,
    refetchInterval: 30_000,
  });
  const notificationUtils = trpc.useUtils();
  const markNotificationRead = trpc.workspace.markNotificationRead.useMutation({
    onMutate: async ({ id }) => {
      await notificationUtils.workspace.inAppNotifications.cancel();
      const previous = notificationUtils.workspace.inAppNotifications.getData();
      if (previous) {
        const wasUnread = previous.items.some((item) => item.id === id && !item.readAt);
        notificationUtils.workspace.inAppNotifications.setData(undefined, {
          ...previous,
          unreadCount: Math.max(0, previous.unreadCount - (wasUnread ? 1 : 0)),
          items: previous.items.map((item) => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => { if (context?.previous) notificationUtils.workspace.inAppNotifications.setData(undefined, context.previous); },
    onSettled: async () => { await notificationUtils.workspace.inAppNotifications.invalidate(); },
  });
  const markAllNotificationsRead = trpc.workspace.markAllNotificationsRead.useMutation({
    onMutate: async () => {
      await notificationUtils.workspace.inAppNotifications.cancel();
      const previous = notificationUtils.workspace.inAppNotifications.getData();
      if (previous) notificationUtils.workspace.inAppNotifications.setData(undefined, {
        ...previous,
        unreadCount: 0,
        items: previous.items.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }),
      });
      return { previous };
    },
    onError: (_error, _input, context) => { if (context?.previous) notificationUtils.workspace.inAppNotifications.setData(undefined, context.previous); },
    onSettled: async () => { await notificationUtils.workspace.inAppNotifications.invalidate(); },
  });
  const unreadCount = (inboxContacts ?? []).reduce((total, contact) => total + contact.unread, 0);
  const notificationItems = notificationsQuery.data?.items ?? [];
  useEffect(() => setMobileOpen(false), [location]);
  return (
    <div className="panel-app">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <div className={`desktop-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onNavigate={() => setMobileOpen(false)} access={access} unreadCount={unreadCount} />
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
      </div>
      <main className="panel-main">
        <header className="panel-header">
          <div className="panel-topbar">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={17} /></button>
            <div className="topbar-spacer" />
            <div className="topbar-status"><span className="live-dot" /> {workspace?.name ?? "Forte Panel"}</div>
            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger asChild>
                <button className="icon-button topbar-bell" aria-label={`Notificações${(notificationsQuery.data?.unreadCount ?? 0) > 0 ? `, ${notificationsQuery.data?.unreadCount} não lidas` : ""}`}>
                  <Bell size={14} />
                  {(notificationsQuery.data?.unreadCount ?? 0) > 0 && <span className="notification-count">{Math.min(notificationsQuery.data!.unreadCount, 99)}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="notification-popover">
                <div className="notification-panel-header">
                  <div><strong>Notificações</strong><small>{notificationsQuery.data?.unreadCount ?? 0} não lidas</small></div>
                  <button className="notification-read-all" disabled={!notificationsQuery.data?.unreadCount || markAllNotificationsRead.isPending} onClick={() => markAllNotificationsRead.mutate()}><CheckCheck size={13} /> Marcar todas lidas</button>
                </div>
                {notificationsQuery.isLoading
                  ? <div className="notification-empty">Carregando notificações…</div>
                  : notificationItems.length === 0
                    ? <div className="notification-empty">Você está em dia. Novas notificações aparecerão aqui.</div>
                    : <div className="notification-list">{notificationItems.map((item) => (
                      <Link href={item.href} key={item.id} onClick={() => {
                        setNotificationsOpen(false);
                        if (!item.readAt) markNotificationRead.mutate({ id: item.id });
                      }}>
                        <span className={`notification-item ${item.readAt ? "is-read" : "is-unread"}`}>
                          <span className="notification-item-copy"><strong>{item.title}</strong><small>{item.body}</small><time>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: workspace?.timezone ?? "America/Sao_Paulo" })}</time></span>
                          {!item.readAt && <i aria-label="Não lida" />}
                        </span>
                      </Link>
                    ))}</div>}
              </PopoverContent>
            </Popover>
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
          </div>
        </header>
        <div className="panel-content">{children}</div>
      </main>
    </div>
  );
}

export function PageLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href}><span className={className}>{children}</span></Link>;
}

export function ViewToggle({ active, onChange, options = ["dia", "semana", "mes"] }: { active: string; onChange: (value: string) => void; options?: string[] }) {
  return (
    <div className="view-toggle">
      {options.map((item) => <button key={item} className={active === item ? "is-active" : ""} onClick={() => onChange(item)}>{item}</button>)}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  return <span className={`status-badge tone-${tone}`}><span className="status-dot" />{children}</span>;
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="section-title-row"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;
}

export function EmptyState({ icon: Icon = BarChart3, title, description }: { icon?: typeof BarChart3; title: string; description: string }) {
  return <div className="empty-state"><Icon size={24} /><strong>{title}</strong><p>{description}</p></div>;
}

export { ChevronLeft, ChevronRight };
