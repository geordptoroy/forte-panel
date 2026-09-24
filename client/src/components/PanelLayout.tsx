import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Bell,
  CalendarDays,
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
  Settings,
  UserCog,
  X,
} from "lucide-react";

const navGroups = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", description: "Visão geral", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", description: "Conversas e atendimento", icon: Inbox, badge: "3" },
      { href: "/kanban", label: "Kanban", description: "Estágios comerciais", icon: KanbanSquare },
      { href: "/agenda", label: "Agenda", description: "Visitas e horários", icon: CalendarDays },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/contacts", label: "Contatos", description: "Leads e histórico", icon: ContactRound },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/billing", label: "Faturamento", description: "Orçamentos e recebimentos", icon: CircleDollarSign },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/integrations", label: "Integrações", description: "Conexões externas", icon: PlugZap },
      { href: "/team", label: "Equipe", description: "Acessos e permissões", icon: UserCog },
      { href: "/settings", label: "Configurações", description: "Preferências do painel", icon: Settings },
    ],
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

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const [location] = useLocation();
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
        {!collapsed && <span>Operação online</span>}
      </div>
      <nav className="panel-nav" aria-label="Navegação principal">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            {!collapsed && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => {
              const active = location === item.href || (item.href === "/contacts" && location.startsWith("/contacts/"));
              const Icon = item.icon;
              return (
                <Link href={item.href} key={item.href} onClick={onNavigate}>
                  <span className={`nav-item ${active ? "is-active" : ""}`} title={collapsed ? item.label : undefined}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 1.8} />
                    {!collapsed && <span className="nav-item-copy"><strong>{item.label}</strong><small>{item.description}</small></span>}
                    {!collapsed && item.badge && <em>{item.badge}</em>}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="profile-row">
          <div className="profile-avatar">GB</div>
          {!collapsed && <div className="profile-copy"><strong>Gabriel Barbosa</strong><small>Administrador</small></div>}
        </div>
        {!collapsed && <div className="sidebar-version">FORTE PANEL <span>v0.1 demo</span></div>}
      </div>
    </aside>
  );
}

export default function PanelLayout({ children, eyebrow = "Operação", title = "Dashboard", description, actions }: PanelLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { data: workspace } = trpc.workspace.current.useQuery();
  useEffect(() => setMobileOpen(false), [location]);

  return (
    <div className="panel-app">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <div className={`desktop-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onNavigate={() => setMobileOpen(false)} />
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
      </div>
      <main className="panel-main">
        <header className="panel-header">
          <div className="panel-topbar">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={17} /></button>
            <div className="topbar-spacer" />
            <div className="topbar-status"><span className="live-dot" /> {workspace?.name ?? "Forte Panel"}</div>
            <button className="icon-button topbar-bell" aria-label="Notificações"><Bell size={14} /></button>
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

export function ViewToggle({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  return (
    <div className="view-toggle">
      {["dia", "semana", "mes"].map((item) => <button key={item} className={active === item ? "is-active" : ""} onClick={() => onChange(item)}>{item}</button>)}
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
