import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const fmtDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const statusLabel: Record<string, string> = {
  active: "Ativo",
  onboarding: "Onboarding",
  suspended: "Suspenso",
  healthy: "Saudável",
  stale: "Sem heartbeat",
  degraded: "Degradado",
  configured: "Configurado",
  not_configured: "Não configurado",
  unknown: "Desconhecido",
  enabled: "Ativa",
  paused: "Pausada",
};
const statusTone = (value: string) =>
  ["active", "healthy", "enabled"].includes(value)
    ? "green"
    : ["suspended", "degraded", "stale", "paused"].includes(value)
      ? "red"
      : "amber";

function PlatformShell({
  children,
  title,
  description,
  active = "overview",
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  active?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="platform-console">
      <aside className="platform-sidebar">
        <div className="platform-brand">
          <div className="platform-brand-mark">
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong>
              FORTE<span> PLATFORM</span>
            </strong>
            <small>Console interno</small>
          </div>
        </div>
        <div className="platform-scope">
          <span className="live-dot" /> Operação protegida
        </div>
        <nav className="platform-nav" aria-label="Navegação da plataforma">
          <button
            className={active === "overview" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin")}
          >
            <LayoutDashboard size={15} /> Visão geral
          </button>
          <button
            className={active === "workspaces" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/workspaces")}
          >
            <Users size={15} /> Workspaces beta
          </button>
          <div className="platform-nav-note">
            <LockKeyhole size={13} />
            <span>
              O console é separado dos papéis owner, admin, manager e agent.
            </span>
          </div>
        </nav>
        <div className="platform-sidebar-foot">
          <small>Suporte read-only por padrão</small>
          <Link href="/dashboard">Voltar ao painel workspace</Link>
        </div>
      </aside>
      <main className="platform-main">
        <header className="platform-header">
          <div>
            <span className="eyebrow">
              Forte Platform /{" "}
              {active === "overview" ? "Operação" : "Workspace"}
            </span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <Link className="platform-back" href="/platform-admin">
            <ArrowLeft size={14} /> Console
          </Link>
        </header>
        <div className="platform-content">{children}</div>
      </main>
    </div>
  );
}

function PlatformAccessGate({ children }: { children: React.ReactNode }) {
  const access = trpc.platform.access.useQuery(undefined, { retry: false });
  if (access.isLoading)
    return (
      <div className="platform-loading">
        <RefreshCw className="spin" size={18} /> Verificando permissão de
        plataforma…
      </div>
    );
  if (access.error)
    return (
      <div className="platform-denied">
        <ShieldAlert size={26} />
        <h1>Console restrito</h1>
        <p>
          Seu usuário não possui uma permissão explícita de plataforma. O papel
          admin do workspace não concede acesso global.
        </p>
        <Link className="btn-secondary" href="/dashboard">
          Voltar ao painel
        </Link>
      </div>
    );
  return <>{children}</>;
}

function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: string;
  icon: typeof Users;
}) {
  return (
    <div className={`platform-metric tone-${tone}`}>
      <div className="platform-metric-top">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function WorkspaceStatus({ value }: { value: string }) {
  return (
    <span className={`platform-status ${statusTone(value)}`}>
      <span />
      {statusLabel[value] ?? value}
    </span>
  );
}

function StartSupport({
  workspaceId,
  canMutate,
  onStarted,
}: {
  workspaceId: number;
  canMutate: boolean;
  onStarted: (sessionId: number) => void;
}) {
  const [reason, setReason] = useState("Acompanhamento operacional do beta");
  const [mode, setMode] = useState<"read_only" | "operator">("read_only");
  const start = trpc.platform.startSupportSession.useMutation({
    onSuccess: session => {
      toast.success("Sessão de suporte iniciada");
      onStarted(session.id);
    },
    onError: error => toast.error(error.message),
  });
  return (
    <section className="platform-card platform-support-start">
      <div className="platform-card-title">
        <div>
          <span className="eyebrow">Acesso escopado</span>
          <h2>Iniciar sessão de suporte</h2>
        </div>
        <LifeBuoy size={19} />
      </div>
      <p>
        O workspace não é acessível sem uma sessão explícita. O padrão é somente
        leitura, com expiração curta e revogação.
      </p>
      <label className="platform-field">
        <span>Motivo obrigatório</span>
        <textarea
          className="textarea-control"
          value={reason}
          onChange={event => setReason(event.target.value)}
          maxLength={500}
        />
      </label>
      <div className="platform-session-options">
        <label>
          <input
            type="radio"
            name="support-mode"
            checked={mode === "read_only"}
            onChange={() => setMode("read_only")}
          />{" "}
          Read-only
        </label>
        <label className={!canMutate ? "is-disabled" : ""}>
          <input
            type="radio"
            name="support-mode"
            disabled={!canMutate}
            checked={mode === "operator"}
            onChange={() => setMode("operator")}
          />{" "}
          Operadora mutável
        </label>
      </div>
      <button
        className="btn-primary"
        disabled={start.isPending || reason.trim().length < 3}
        onClick={() =>
          start.mutate({ workspaceId, mode, reason, expiresInMinutes: 30 })
        }
      >
        <KeyRound size={14} /> {start.isPending ? "Abrindo…" : "Abrir sessão"}
      </button>
    </section>
  );
}

export function PlatformAdminHome() {
  return (
    <PlatformAccessGate>
      <PlatformAdminOverview />
    </PlatformAccessGate>
  );
}

function PlatformAdminOverview() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const access = trpc.platform.access.useQuery();
  const workspaces = trpc.platform.workspaces.useQuery(
    { search },
    { refetchInterval: 30_000 }
  );
  const start = trpc.platform.startSupportSession.useMutation({
    onSuccess: (session, input) =>
      navigate(
        `/platform-admin/workspaces/${input.workspaceId}?session=${session.id}`
      ),
    onError: error => toast.error(error.message),
  });
  const [reasonWorkspaceId, setReasonWorkspaceId] = useState<number | null>(
    null
  );
  const [reason, setReason] = useState("Acompanhamento operacional do beta");
  const items = workspaces.data?.items ?? [];
  const summary = workspaces.data?.summary;
  return (
    <PlatformShell
      title="Console Administrativo"
      description="Operação de contas beta sem misturar o console da plataforma com os workspaces clientes."
    >
      <div className="platform-banner">
        <ShieldCheck size={17} />
        <div>
          <strong>Fronteira de segurança ativa</strong>
          <span>
            O acesso usa platformAdmins, não users.role. Nenhuma senha, API key
            ou token operacional é exibido.
          </span>
        </div>
      </div>
      <div className="platform-metric-grid">
        <MetricCard
          label="Contas monitoradas"
          value={summary?.total ?? "—"}
          helper="Workspaces encontrados"
          icon={Users}
          tone="blue"
        />
        <MetricCard
          label="Ativas"
          value={summary?.active ?? "—"}
          helper={`${summary?.onboarding ?? 0} em onboarding`}
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard
          label="Perto da quota"
          value={summary?.nearQuota ?? "—"}
          helper="70% ou mais na janela"
          icon={Activity}
          tone="amber"
        />
        <MetricCard
          label="Sinais degradados"
          value={summary?.degraded ?? "—"}
          helper={`${summary?.suspended ?? 0} suspensas`}
          icon={ShieldAlert}
          tone="red"
        />
      </div>
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">Contas beta</span>
            <h2>Workspaces</h2>
          </div>
          <div className="platform-search">
            <Search size={14} />
            <input
              className="input-control"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por nome ou slug"
            />
          </div>
        </div>
        {workspaces.isLoading ? (
          <PlatformState
            icon={RefreshCw}
            title="Carregando workspaces"
            description="Consultando status, saúde e uso de cada conta."
            loading
          />
        ) : workspaces.error ? (
          <PlatformState
            icon={XCircle}
            title="Não foi possível carregar"
            description={workspaces.error.message}
          />
        ) : items.length === 0 ? (
          <PlatformState
            icon={Users}
            title="Nenhum workspace encontrado"
            description="Ajuste a busca ou aguarde o primeiro cadastro beta."
          />
        ) : (
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Status</th>
                  <th>Saúde</th>
                  <th>Uso</th>
                  <th>Owner</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.slug} · {item.plan}
                      </small>
                    </td>
                    <td>
                      <WorkspaceStatus value={item.status} />
                    </td>
                    <td>
                      <div className="platform-health-lines">
                        <span>
                          <i className={statusTone(item.health.channel)} />{" "}
                          Canal {statusLabel[item.health.channel]}
                        </span>
                        <span>
                          <i className={statusTone(item.health.worker)} />{" "}
                          Worker {statusLabel[item.health.worker]}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="platform-usage-mini">
                        {Object.entries(item.usage).map(([metric, value]) => (
                          <span key={metric} title={metric}>
                            <b>{value.used}</b>/{value.limit}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span>{item.owner?.name ?? "Sem owner"}</span>
                      <small>{item.memberCount} membros</small>
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          className="btn-secondary"
                          onClick={() =>
                            navigate(`/platform-admin/workspaces/${item.id}`)
                          }
                        >
                          Detalhe
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            setReasonWorkspaceId(item.id);
                            setReason("Acompanhamento operacional do beta");
                          }}
                        >
                          Suporte
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {reasonWorkspaceId && (
        <div className="platform-modal-backdrop">
          <section className="platform-modal">
            <button
              className="icon-button platform-modal-close"
              onClick={() => setReasonWorkspaceId(null)}
              aria-label="Fechar"
            >
              <XCircle size={17} />
            </button>
            <span className="eyebrow">Sessão read-only</span>
            <h2>Abrir suporte</h2>
            <p>
              Escopo: workspace #{reasonWorkspaceId}. A sessão expira em 30
              minutos.
            </p>
            <label className="platform-field">
              <span>Motivo</span>
              <textarea
                className="textarea-control"
                value={reason}
                onChange={event => setReason(event.target.value)}
              />
            </label>
            <button
              className="btn-primary"
              disabled={start.isPending || reason.trim().length < 3}
              onClick={() =>
                start.mutate({
                  workspaceId: reasonWorkspaceId,
                  mode: "read_only",
                  reason,
                  expiresInMinutes: 30,
                })
              }
            >
              <LifeBuoy size={14} /> Abrir sessão read-only
            </button>
          </section>
        </div>
      )}
      <div className="platform-footnote">
        <LockKeyhole size={13} /> Para mutações de suporte, inicie uma sessão
        operadora explícita dentro do workspace e informe o motivo antes de
        publicar qualquer alteração.
      </div>
    </PlatformShell>
  );
}

function PlatformState({
  icon: Icon,
  title,
  description,
  loading = false,
}: {
  icon: typeof RefreshCw;
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <div className="platform-state">
      <Icon size={22} className={loading ? "spin" : ""} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function PlatformWorkspacePage() {
  const [, params] = useRoute("/platform-admin/workspaces/:id");
  const workspaceId = Number(params?.id ?? 0);
  return (
    <PlatformAccessGate>
      <PlatformWorkspaceDetail workspaceId={workspaceId} />
    </PlatformAccessGate>
  );
}

function PlatformWorkspaceDetail({ workspaceId }: { workspaceId: number }) {
  const [, navigate] = useLocation();
  const querySession = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("session");
  const [sessionId, setSessionId] = useState(Number(querySession ?? 0));
  const access = trpc.platform.access.useQuery();
  const detailInput = useMemo(
    () => ({ workspaceId, sessionId }),
    [workspaceId, sessionId]
  );
  const detail = trpc.platform.workspaceDetail.useQuery(detailInput, {
    enabled: workspaceId > 0 && sessionId > 0,
    retry: false,
  });
  const currentSession = detail.data?.workspace
    ? { id: sessionId, mode: "read_only" as const }
    : null;
  const revoke = trpc.platform.revokeSupportSession.useMutation({
    onSuccess: () => {
      toast.success("Sessão revogada");
      setSessionId(0);
      navigate(`/platform-admin/workspaces/${workspaceId}`);
    },
    onError: error => toast.error(error.message),
  });
  const [tab, setTab] = useState<"summary" | "support" | "agent" | "audit">(
    "summary"
  );
  const startOperator = trpc.platform.startSupportSession.useMutation({
    onSuccess: session => {
      toast.success("Sessão operadora iniciada");
      setSessionId(session.id);
    },
    onError: error => toast.error(error.message),
  });
  if (!sessionId)
    return (
      <PlatformShell
        title="Abrir workspace"
        description="Escolha uma sessão escopada antes de consultar dados da conta."
        active="workspaces"
      >
        <StartSupport
          workspaceId={workspaceId}
          canMutate={Boolean(access.data?.canMutate)}
          onStarted={id => {
            setSessionId(id);
            navigate(`/platform-admin/workspaces/${workspaceId}?session=${id}`);
          }}
        />
      </PlatformShell>
    );
  if (detail.isLoading)
    return (
      <PlatformShell
        title="Workspace"
        description="Carregando detalhe protegido."
        active="workspaces"
      >
        <PlatformState
          icon={RefreshCw}
          title="Abrindo sessão"
          description="Validando escopo, expiração e workspace."
          loading
        />
      </PlatformShell>
    );
  if (detail.error)
    return (
      <PlatformShell
        title="Workspace indisponível"
        description="A sessão não pode consultar este escopo."
        active="workspaces"
      >
        <PlatformState
          icon={ShieldAlert}
          title="Acesso encerrado"
          description={detail.error.message}
        />
        <button className="btn-secondary" onClick={() => setSessionId(0)}>
          Iniciar outra sessão
        </button>
      </PlatformShell>
    );
  const item = detail.data!;
  return (
    <PlatformShell
      title={item.workspace.name}
      description={`${item.workspace.slug} · ${item.workspace.plan} · owner e membros sob escopo explícito`}
      active="workspaces"
    >
      <div className="platform-detail-top">
        <Link className="btn-ghost" href="/platform-admin">
          <ArrowLeft size={13} /> Todas as contas
        </Link>
        <div className="platform-session-pill">
          <LifeBuoy size={13} /> Sessão #{sessionId} ·{" "}
          {item.session.mode === "operator" ? "operadora" : "read-only"} ·
          expira {fmtDate(item.session.expiresAt)}
          <button
            onClick={() =>
              revoke.mutate({
                sessionId,
                reason: "Encerramento manual pelo operador",
              })
            }
          >
            Revogar
          </button>
        </div>
      </div>
      <div className="platform-detail-hero">
        <div>
          <span className="eyebrow">Workspace / Operação</span>
          <h2>{item.workspace.name}</h2>
          <p>
            Owner: {item.workspace.owner?.name ?? "não definido"} ·{" "}
            {item.workspace.memberCount} membros · criado em{" "}
            {fmtDate(item.workspace.createdAt)}
          </p>
        </div>
        <div className="platform-detail-badges">
          <WorkspaceStatus value={item.workspace.status} />
          <WorkspaceStatus value={item.workspace.health.channel} />
          <WorkspaceStatus value={item.workspace.health.worker} />
        </div>
      </div>
      <div className="platform-tabs">
        {[
          ["summary", "Resumo"],
          ["support", "Suporte"],
          ["agent", "Agente"],
          ["audit", "Auditoria"],
        ].map(([key, label]) => (
          <button
            className={tab === key ? "is-active" : ""}
            key={key}
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "summary" && (
        <SummaryTab
          item={item}
          onAgent={() => setTab("agent")}
          onSupport={() => setTab("support")}
        />
      )}
      {tab === "support" && (
        <SupportTab
          item={item}
          sessionId={sessionId}
          canMutate={
            Boolean(access.data?.canMutate) && item.session.mode === "operator"
          }
          canEscalate={Boolean(access.data?.canMutate)}
          onOperator={() =>
            startOperator.mutate({
              workspaceId,
              mode: "operator",
              reason: "Ação mutável de suporte autorizada no beta",
              expiresInMinutes: 30,
            })
          }
        />
      )}
      {tab === "agent" && (
        <AgentTab
          item={item}
          input={detailInput}
          canMutate={
            Boolean(access.data?.canMutate) && item.session.mode === "operator"
          }
        />
      )}
      {tab === "audit" && <AuditTab item={item} />}
    </PlatformShell>
  );
}

function SummaryTab({
  item,
  onAgent,
  onSupport,
}: {
  item: any;
  onAgent: () => void;
  onSupport: () => void;
}) {
  return (
    <>
      <div className="platform-metric-grid">
        <MetricCard
          label="Canal"
          value={statusLabel[item.workspace.health.channel]}
          helper={`${item.workspace.channelCount} canais ativos`}
          icon={MessageSquareText}
          tone={statusTone(item.workspace.health.channel)}
        />
        <MetricCard
          label="IA"
          value={statusLabel[item.workspace.health.ai]}
          helper={`${item.agent.current.model} · v${item.agent.versions[0]?.version ?? 0}`}
          icon={Bot}
          tone={statusTone(item.workspace.health.ai)}
        />
        <MetricCard
          label="Fila outbound"
          value={item.workspace.health.outboundQueue}
          helper="Mensagens aguardando worker"
          icon={Clock3}
          tone={item.workspace.health.outboundQueue > 0 ? "amber" : "green"}
        />
        <MetricCard
          label="Falhas recentes"
          value={item.workspace.health.recentFailures}
          helper="Mensagens com status failed"
          icon={ShieldAlert}
          tone={item.workspace.health.recentFailures > 0 ? "red" : "green"}
        />
      </div>
      <div className="platform-two-columns">
        <section className="platform-card">
          <div className="platform-card-title">
            <h2>Membros e owner</h2>
            <Users size={17} />
          </div>
          <div className="platform-member-list">
            {item.members.map((member: any) => (
              <div className="platform-member" key={member.id}>
                <div className="avatar">
                  {(member.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{member.name ?? "Sem nome"}</strong>
                  <small>
                    {member.email} · {member.role}
                  </small>
                </div>
                <WorkspaceStatus
                  value={member.active ? "active" : "suspended"}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="platform-card">
          <div className="platform-card-title">
            <h2>Canais mascarados</h2>
            <KeyRound size={17} />
          </div>
          {item.channels.length === 0 ? (
            <PlatformState
              icon={MessageSquareText}
              title="Nenhum canal"
              description="A conta ainda não possui canal persistido."
            />
          ) : (
            <div className="platform-member-list">
              {item.channels.map((channel: any) => (
                <div className="platform-member" key={channel.id}>
                  <div className="platform-channel-icon">
                    <MessageSquareText size={15} />
                  </div>
                  <div>
                    <strong>{channel.name}</strong>
                    <small>
                      {channel.provider} ·{" "}
                      {channel.phoneNumber ?? "número não informado"}
                    </small>
                  </div>
                  <WorkspaceStatus
                    value={channel.active ? "active" : "suspended"}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="platform-safe-note">
            <ShieldCheck size={13} /> Credenciais operacionais não fazem parte
            deste payload.
          </div>
        </section>
      </div>
      <div className="platform-quick-actions">
        <button className="btn-secondary" onClick={onSupport}>
          <LifeBuoy size={14} /> Abrir suporte
        </button>
        <button className="btn-secondary" onClick={onAgent}>
          <Bot size={14} /> Configurar agente
        </button>
      </div>
    </>
  );
}

function SupportTab({
  item,
  sessionId,
  canMutate,
  canEscalate,
  onOperator,
}: {
  item: any;
  sessionId: number;
  canMutate: boolean;
  canEscalate: boolean;
  onOperator: () => void;
}) {
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("Registro de suporte beta");
  const notes = trpc.platform.notes.useQuery({
    workspaceId: item.workspace.id,
    sessionId,
  });
  const create = trpc.platform.createNote.useMutation({
    onSuccess: () => {
      setBody("");
      void notes.refetch();
      toast.success("Nota registrada");
    },
    onError: error => toast.error(error.message),
  });
  const setAi = trpc.platform.setWorkspaceAi.useMutation({
    onSuccess: () => toast.success("Estado da IA atualizado"),
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.platform.setWorkspaceStatus.useMutation({
    onSuccess: () => toast.success("Status atualizado"),
    onError: error => toast.error(error.message),
  });
  return (
    <div className="platform-two-columns">
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">Sessão #{sessionId}</span>
            <h2>Suporte controlado</h2>
          </div>
          <LifeBuoy size={17} />
        </div>
        <p className="platform-muted">
          Read-only por padrão. Para ações mutáveis, escale para uma sessão
          operadora; motivo e auditoria continuam obrigatórios.
        </p>
        <button
          className="btn-secondary"
          disabled={!canEscalate || canMutate}
          onClick={onOperator}
        >
          <KeyRound size={14} />{" "}
          {canMutate
            ? "Sessão operadora ativa"
            : "Escalar para sessão operadora"}
        </button>
        <div className="platform-support-actions">
          <button
            className="btn-secondary"
            disabled={!canMutate || setAi.isPending}
            onClick={() =>
              setAi.mutate({
                workspaceId: item.workspace.id,
                sessionId,
                enabled: false,
                reason,
              })
            }
          >
            <Pause size={13} /> Pausar IA
          </button>
          <button
            className="btn-secondary"
            disabled={!canMutate || setAi.isPending}
            onClick={() =>
              setAi.mutate({
                workspaceId: item.workspace.id,
                sessionId,
                enabled: true,
                reason,
              })
            }
          >
            <Play size={13} /> Reativar IA
          </button>
          <button
            className="btn-secondary"
            disabled={!canMutate || setStatus.isPending}
            onClick={() =>
              setStatus.mutate({
                workspaceId: item.workspace.id,
                sessionId,
                status:
                  item.workspace.status === "suspended"
                    ? "active"
                    : "suspended",
                reason,
              })
            }
          >
            {item.workspace.status === "suspended" ? (
              <>
                <CheckCircle2 size={13} /> Reativar workspace
              </>
            ) : (
              <>
                <ShieldAlert size={13} /> Suspender workspace
              </>
            )}
          </button>
        </div>
        <label className="platform-field">
          <span>Motivo para ação mutável</span>
          <textarea
            className="textarea-control"
            value={reason}
            onChange={event => setReason(event.target.value)}
          />
        </label>
      </section>
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">Registro interno</span>
            <h2>Notas de suporte</h2>
          </div>
          <FileText size={17} />
        </div>
        <label className="platform-field">
          <span>Nota</span>
          <textarea
            className="textarea-control"
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Ex.: validar configuração do canal no staging."
          />
        </label>
        <button
          className="btn-primary"
          disabled={!canMutate || create.isPending || body.trim().length < 2}
          onClick={() =>
            create.mutate({
              workspaceId: item.workspace.id,
              sessionId,
              body,
              reason,
            })
          }
        >
          {canMutate ? "Registrar nota" : "Escalar para registrar nota"}
        </button>
        <div className="platform-note-list">
          {notes.isLoading ? (
            <span className="platform-muted">Carregando notas…</span>
          ) : notes.data?.length ? (
            notes.data.map(note => (
              <div key={note.id}>
                <strong>{note.authorName ?? "Operador"}</strong>
                <small>{fmtDate(note.createdAt)}</small>
                <p>{note.body}</p>
              </div>
            ))
          ) : (
            <span className="platform-muted">
              Nenhuma nota interna neste workspace.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function AgentTab({
  item,
  input,
  canMutate,
}: {
  item: any;
  input: { workspaceId: number; sessionId: number };
  canMutate: boolean;
}) {
  const agent = item.agent;
  const [enabled, setEnabled] = useState(
    agent.draft?.config.enabled ?? agent.current.enabled
  );
  const [model, setModel] = useState(
    agent.draft?.config.model ?? agent.current.model
  );
  const [prompt, setPrompt] = useState(
    agent.draft?.prompt ?? agent.current.systemPrompt
  );
  const [maxSteps, setMaxSteps] = useState(
    agent.draft?.config.maxSteps ?? agent.current.maxSteps
  );
  const [reason, setReason] = useState("Ajuste operacional do agente no beta");
  const [message, setMessage] = useState(
    "Olá, gostaria de saber mais sobre os serviços."
  );
  const save = trpc.platform.saveAgentDraft.useMutation({
    onSuccess: () => toast.success("Rascunho salvo"),
    onError: error => toast.error(error.message),
  });
  const publish = trpc.platform.publishAgentDraft.useMutation({
    onSuccess: () => toast.success("Versão publicada"),
    onError: error => toast.error(error.message),
  });
  const simulate = trpc.platform.simulateAgent.useMutation({
    onSuccess: () => toast.success("Simulação concluída"),
    onError: error => toast.error(error.message),
  });
  const rollback = trpc.platform.rollbackAgent.useMutation({
    onSuccess: () => toast.success("Rollback publicado como nova versão"),
    onError: error => toast.error(error.message),
  });
  const currentVersion = agent.versions.find(
    (version: any) => version.status === "published"
  );
  return (
    <div className="platform-agent-layout">
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">
              Rascunho → validação → simulação → publicação
            </span>
            <h2>Configuração por workspace</h2>
          </div>
          <Bot size={18} />
        </div>
        <div className="platform-draft-warning">
          <ShieldCheck size={14} />
          <span>
            O prompt é versionado. Segredos continuam fora da configuração e a
            simulação não chama PAPI, Meta ou LLM.
          </span>
        </div>
        <div className="platform-form-grid">
          <label className="platform-field">
            <span>Estado da IA</span>
            <select
              className="select-control"
              value={enabled ? "enabled" : "paused"}
              onChange={event => setEnabled(event.target.value === "enabled")}
            >
              <option value="enabled">Ativa</option>
              <option value="paused">Pausada</option>
            </select>
          </label>
          <label className="platform-field">
            <span>Modelo lógico</span>
            <input
              className="input-control"
              value={model}
              onChange={event => setModel(event.target.value)}
            />
          </label>
          <label className="platform-field">
            <span>Máximo de etapas</span>
            <input
              className="input-control"
              type="number"
              min={1}
              max={8}
              value={maxSteps}
              onChange={event => setMaxSteps(Number(event.target.value))}
            />
          </label>
          <label className="platform-field full">
            <span>System prompt operacional</span>
            <textarea
              className="textarea-control agent-prompt-editor"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
            />
          </label>
          <label className="platform-field full">
            <span>Motivo obrigatório</span>
            <input
              className="input-control"
              value={reason}
              onChange={event => setReason(event.target.value)}
            />
          </label>
        </div>
        <div className="platform-form-actions">
          <button
            className="btn-secondary"
            disabled={!canMutate || save.isPending}
            onClick={() =>
              save.mutate({
                ...input,
                enabled,
                model,
                systemPrompt: prompt,
                maxSteps,
                reason,
              })
            }
          >
            <FileText size={14} /> Salvar rascunho
          </button>
          <button
            className="btn-primary"
            disabled={!canMutate || publish.isPending}
            onClick={() => publish.mutate({ ...input, reason })}
          >
            <Sparkles size={14} /> Publicar versão
          </button>
        </div>
      </section>
      <aside className="platform-agent-side">
        <section className="platform-card">
          <div className="platform-card-title">
            <div>
              <span className="eyebrow">Sem envio externo</span>
              <h2>Simulação</h2>
            </div>
            <MessageSquareText size={17} />
          </div>
          <textarea
            className="textarea-control"
            value={message}
            onChange={event => setMessage(event.target.value)}
          />
          <button
            className="btn-secondary"
            disabled={!canMutate || simulate.isPending}
            onClick={() => simulate.mutate({ ...input, message, reason })}
          >
            <Play size={13} /> Executar simulação
          </button>
          {simulate.data && (
            <div className="platform-simulation-result">
              <small>
                providerCalled: {String(simulate.data.providerCalled)}
              </small>
              <p>{simulate.data.output}</p>
            </div>
          )}
        </section>
        <section className="platform-card">
          <div className="platform-card-title">
            <div>
              <span className="eyebrow">Imutáveis</span>
              <h2>Versões</h2>
            </div>
            <Clock3 size={17} />
          </div>
          {agent.versions.length === 0 ? (
            <PlatformState
              icon={Clock3}
              title="Nenhuma publicação"
              description="Salve e simule um rascunho antes de publicar."
            />
          ) : (
            <div className="platform-version-list">
              {agent.versions.map((version: any) => (
                <div key={version.id}>
                  <div>
                    <strong>v{version.version}</strong>
                    <WorkspaceStatus
                      value={
                        version.status === "published" ? "active" : "onboarding"
                      }
                    />
                  </div>
                  <small>
                    {fmtDate(version.publishedAt ?? version.createdAt)} ·{" "}
                    {version.model ?? version.config.model}
                  </small>
                  <button
                    className="btn-ghost"
                    disabled={
                      !canMutate ||
                      rollback.isPending ||
                      version.status !== "published" ||
                      version.id === currentVersion?.id
                    }
                    onClick={() =>
                      rollback.mutate({
                        ...input,
                        versionId: version.id,
                        reason: `Rollback para v${version.version}: ${reason}`,
                      })
                    }
                  >
                    Rollback
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function AuditTab({ item }: { item: any }) {
  return (
    <div className="platform-two-columns">
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">Plataforma</span>
            <h2>Auditoria de suporte</h2>
          </div>
          <ShieldCheck size={17} />
        </div>
        {item.platformAudit.length === 0 ? (
          <PlatformState
            icon={ShieldCheck}
            title="Sem ações de suporte"
            description="Ações do console aparecerão aqui com motivo e escopo."
          />
        ) : (
          <div className="platform-audit-list">
            {item.platformAudit.map((entry: any) => (
              <div key={entry.id}>
                <div>
                  <strong>{entry.summary}</strong>
                  <WorkspaceStatus
                    value={entry.result === "success" ? "active" : "degraded"}
                  />
                </div>
                <small>
                  {entry.actorName ?? "Operador"} · {fmtDate(entry.createdAt)}
                </small>
                <p>Motivo: {entry.reason}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="platform-card">
        <div className="platform-card-title">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Auditoria operacional</h2>
          </div>
          <Activity size={17} />
        </div>
        {item.workspaceAudit.length === 0 ? (
          <PlatformState
            icon={Activity}
            title="Sem eventos"
            description="Ações do workspace aparecerão quando houver atividade."
          />
        ) : (
          <div className="platform-audit-list">
            {item.workspaceAudit.slice(0, 40).map((entry: any) => (
              <div key={entry.id}>
                <strong>{entry.action}</strong>
                <small>
                  {entry.actorName ?? "Sistema"} · {fmtDate(entry.createdAt)}
                </small>
                <p>{entry.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
