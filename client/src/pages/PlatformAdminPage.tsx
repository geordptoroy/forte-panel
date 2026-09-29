import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";
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
  PlugZap,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
  LogOut,
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
  connected: "Conectado",
  ready: "Pronto",
  online: "Online",
  idle: "Aguardando pareamento",
  disconnected: "Desconectado",
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
  ["active", "healthy", "enabled", "connected", "ready", "online"].includes(value)
    ? "green"
    : ["suspended", "degraded", "stale", "paused", "disconnected"].includes(value)
      ? "red"
      : "amber";

export function PlatformShell({
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
  const { logout } = useAuth();
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
          <span className="platform-validated-lock" title="Fluxos validados congelados para o smoke test">
            <LockKeyhole size={11} /> Validado
          </span>
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
          <button
            className={active === "ai" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/ai")}
          >
            <Bot size={15} /> IA global
          </button>
          <button
            className={active === "support" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/support")}
          >
            <LifeBuoy size={15} /> Suporte
          </button>
          <button
            className={active === "support-instances" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/support-instances")}
          >
            <PlugZap size={15} /> Instâncias de suporte
          </button>
          <button
            className={active === "prompts" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/prompts")}
          >
            <Sparkles size={15} /> Prompts por instância
          </button>
          <button
            className={active === "support-inbox" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/support-inbox")}
          >
            <MessageSquareText size={15} /> Inbox de suporte
          </button>
          <button
            className={active === "audit" ? "is-active" : ""}
            onClick={() => navigate("/platform-admin/audit")}
          >
            <FileText size={15} /> Auditoria
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
          <Link href="/platform-admin">Voltar ao console da plataforma</Link>
          <button
            className="platform-logout"
            type="button"
            onClick={() => void logout()}
          >
            <LogOut size={13} /> Sair do console
          </button>
        </div>
      </aside>
      <main className="platform-main">
        <header className="platform-header">
          <div>
            <span className="eyebrow">
              Forte Platform /{" "}
              {active === "overview"
                ? "Operação"
                : active === "ai"
                  ? "IA global"
                : active === "support"
                    ? "Suporte"
                    : active === "support-instances"
                      ? "Instâncias de suporte"
                      : active === "support-inbox"
                        ? "Inbox de suporte"
                    : active === "audit"
                      ? "Auditoria"
                      : "Workspace"}
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

export function PlatformAccessGate({ children }: { children: React.ReactNode }) {
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
        <Link className="btn-secondary" href="/login">
          Voltar ao login
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

type AiCapability = "whatsapp_reply" | "audio_transcription" | "image_analysis" | "document_analysis" | "admin_support";
type AiProvider = "nvidia_nim" | "google_gemini" | "openai_compatible";
const aiCapabilityLabels: Record<AiCapability, { title: string; description: string }> = {
  whatsapp_reply: { title: "Resposta no WhatsApp", description: "Agente que responde mensagens e executa ferramentas autorizadas." },
  audio_transcription: { title: "Transcrição de áudio", description: "Converte mensagens de voz em texto antes do roteamento." },
  image_analysis: { title: "Análise de imagem", description: "Interpreta fotos, comprovantes e imagens recebidas." },
  document_analysis: { title: "Análise de documento", description: "Lê PDFs e arquivos encaminhados ao atendimento." },
  admin_support: { title: "Suporte do Console", description: "Assistente separado para operação e diagnóstico da plataforma." },
};
const aiProviderLabels: Record<AiProvider, string> = { nvidia_nim: "NVIDIA NIM", google_gemini: "Google Gemini", openai_compatible: "OpenAI-compatible" };

function AiConnectionsCard({ canMutate }: { canMutate: boolean }) {
  const utils = trpc.useUtils();
  const connections = trpc.platform.aiConnections.useQuery();
  const [form, setForm] = useState({ name: "", capability: "whatsapp_reply" as AiCapability, provider: "openai_compatible" as AiProvider, baseUrl: "", model: "", apiKey: "" });
  const [reason, setReason] = useState("Remoção de conexão de IA");
  const create = trpc.platform.createAiConnection.useMutation({ onSuccess: () => { setForm({ name: "", capability: "whatsapp_reply", provider: "openai_compatible", baseUrl: "", model: "", apiKey: "" }); void utils.platform.aiConnections.invalidate(); toast.success("Conexão de IA criada"); }, onError: error => toast.error(error.message) });
  const test = trpc.platform.testAiConnection.useMutation({ onSuccess: result => { void utils.platform.aiConnections.invalidate(); result.ready ? toast.success(`${result.message} · ${result.latencyMs} ms`) : toast.error(result.message); }, onError: error => toast.error(error.message) });
  const remove = trpc.platform.deleteAiConnection.useMutation({ onSuccess: () => { void utils.platform.aiConnections.invalidate(); toast.success("Conexão excluída"); }, onError: error => toast.error(error.message) });
  return (
    <section className="platform-card" style={{ marginBottom: 20 }}>
      <div className="platform-card-title">
        <div>
          <span className="eyebrow">Conexões da plataforma</span>
          <h2>Uma API por função do sistema</h2>
        </div>
        <KeyRound size={18} />
      </div>
      <p className="platform-muted">Cadastre a URL, modelo e chave do provedor para uma função específica. A chave fica criptografada no servidor e nunca retorna ao navegador em texto aberto.</p>
      <div className="platform-form-grid">
        <label className="platform-field"><span>Nome da conexão</span><input className="input-control" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Gemini para atendimento" /></label>
        <label className="platform-field"><span>Função do sistema</span><select className="select-control" value={form.capability} onChange={event => setForm(current => ({ ...current, capability: event.target.value as AiCapability }))}>{Object.entries(aiCapabilityLabels).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></label>
        <label className="platform-field"><span>Provedor</span><select className="select-control" value={form.provider} onChange={event => setForm(current => ({ ...current, provider: event.target.value as AiProvider }))}>{Object.entries(aiProviderLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label className="platform-field"><span>URL da API</span><input className="input-control" value={form.baseUrl} onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.exemplo.com/v1" /></label>
        <label className="platform-field"><span>Modelo</span><input className="input-control" value={form.model} onChange={event => setForm(current => ({ ...current, model: event.target.value }))} placeholder="ID exato do modelo" /></label>
        <label className="platform-field"><span>API key do provedor</span><input className="input-control" type="password" value={form.apiKey} onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))} placeholder="Cole a chave aqui" /></label>
      </div>
      <div className="platform-form-actions"><button className="btn-primary" disabled={!canMutate || create.isPending || !form.name || !form.baseUrl || !form.model || !form.apiKey} onClick={() => create.mutate(form)}><KeyRound size={14} /> {create.isPending ? "Criando…" : "Criar conexão"}</button>{!canMutate && <small className="platform-muted">Sua permissão de plataforma é somente leitura.</small>}</div>
      <div className="platform-card-title" style={{ marginTop: 24 }}><div><span className="eyebrow">Conexões cadastradas</span><h3>Roteamento disponível para o sistema</h3></div><Sparkles size={16} /></div>
      {connections.isLoading ? <p className="platform-muted">Carregando conexões…</p> : connections.data?.length ? <div className="platform-ai-routing-grid">{connections.data.map(connection => <div className="platform-ai-route" key={connection.id}><strong>{connection.name}</strong><small>{aiCapabilityLabels[connection.capability as AiCapability]?.title} · {aiProviderLabels[connection.provider as AiProvider]}</small><span>{connection.model}</span><span className={`platform-status ${connection.status === "validated" ? "green" : connection.status === "error" ? "red" : "amber"}`}><span />{connection.status === "validated" ? "Validada" : connection.status === "error" ? "Erro no teste" : "Teste pendente"}</span><small>{connection.apiKey || "Chave cadastrada"}</small><div className="platform-form-actions"><button className="btn-secondary" disabled={!canMutate || test.isPending} onClick={() => test.mutate({ id: connection.id })}><PlugZap size={13} /> Testar</button><button className="btn-secondary" disabled={!canMutate || remove.isPending} onClick={() => { if (reason.trim().length >= 3 && window.confirm(`Excluir a conexão ${connection.name}?`)) remove.mutate({ id: connection.id, reason }); }}><XCircle size={13} /> Excluir</button></div></div>)}</div> : <p className="platform-muted">Nenhuma conexão criada. Crie a primeira acima.</p>}
    </section>
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

export function PlatformState({
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
  const [location, navigate] = useLocation();
  const querySession = new URLSearchParams(location.split("?")[1] ?? "").get(
    "session"
  );
  const [sessionId, setSessionId] = useState(Number(querySession ?? 0));
  useEffect(() => {
    setSessionId(Number(querySession ?? 0));
  }, [querySession]);
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
      navigate(`/platform-admin/workspaces/${workspaceId}?session=${session.id}`);
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
        <button
          className="btn-secondary"
          onClick={() => {
            setSessionId(0);
            navigate(`/platform-admin/workspaces/${workspaceId}`);
          }}
        >
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
        <>
          <SummaryTab
            item={item}
            sessionId={sessionId}
            canMutate={Boolean(access.data?.canMutate) && item.session.mode === "operator"}
            onAgent={() => setTab("agent")}
            onSupport={() => setTab("support")}
          />
          <ResetWorkspaceCard
            workspaceId={workspaceId}
            sessionId={sessionId}
            canMutate={Boolean(access.data?.canMutate) && item.session.mode === "operator"}
          />
        </>
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
          onRefresh={() => void detail.refetch()}
          canMutate={
            Boolean(access.data?.canMutate) && item.session.mode === "operator"
          }
        />
      )}
      {tab === "audit" && <AuditTab item={item} />}
    </PlatformShell>
  );
}

function ResetWorkspaceCard({
  workspaceId,
  sessionId,
  canMutate,
}: {
  workspaceId: number;
  sessionId: number;
  canMutate: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  const reset = trpc.platform.resetWorkspace.useMutation({
    onSuccess: () => {
      setConfirmation("");
      toast.success("Dados operacionais do workspace apagados");
    },
    onError: error => toast.error(error.message),
  });
  const phrase = "APAGAR DADOS DO WORKSPACE";
  return (
    <section className="platform-card platform-danger-card">
      <div className="platform-card-title">
        <div>
          <span className="eyebrow">Somente sessão operadora</span>
          <h2>Limpar dados de desenvolvimento</h2>
        </div>
        <ShieldAlert size={17} />
      </div>
      <p className="platform-muted">
        Remove mensagens, contatos, agenda, catálogo, canais e configurações
        operacionais deste workspace. Usuários, membership e acesso permanecem.
      </p>
      <code>{phrase}</code>
      <input
        className="input-control"
        value={confirmation}
        onChange={event => setConfirmation(event.target.value)}
        placeholder={phrase}
        disabled={!canMutate || reset.isPending}
      />
      <button
        className="btn-primary"
        style={{ marginTop: 12, background: "#8f3030" }}
        disabled={!canMutate || reset.isPending || confirmation !== phrase}
        onClick={() => {
          if (!window.confirm("Confirma apagar os dados deste workspace?")) return;
          reset.mutate({
            workspaceId,
            sessionId,
            confirmation: phrase,
            reason: "Limpeza de dados de desenvolvimento solicitada pelo suporte",
          });
        }}
      >
        {reset.isPending ? "Apagando..." : "Apagar dados do workspace"}
      </button>
      {!canMutate && <small className="platform-muted">Inicie uma sessão operadora para habilitar esta ação.</small>}
    </section>
  );
}

function SummaryTab({
  item,
  sessionId,
  canMutate,
  onAgent,
  onSupport,
}: {
  item: any;
  sessionId: number;
  canMutate: boolean;
  onAgent: () => void;
  onSupport: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const createInstance = trpc.platform.createBaileysInstance.useMutation({
    onSuccess: () => {
      setInstanceName("");
      toast.success("Instância Baileys criada");
      void utils.platform.workspaceDetail.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const disconnect = trpc.platform.disconnectBaileysInstance.useMutation({
    onSuccess: () => {
      toast.success("Instância desconectada");
      void utils.platform.workspaceDetail.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const pair = trpc.platform.requestBaileysPairingCode.useMutation({
    onSuccess: result => {
      setPairingCode(result.code);
      toast.success("Código de pareamento gerado");
    },
    onError: error => toast.error(error.message),
  });
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
        <section className="platform-card">
          <div className="platform-card-title">
            <div>
              <span className="eyebrow">Baileys / operação</span>
              <h2>Instâncias WhatsApp</h2>
            </div>
            <PlugZap size={17} />
          </div>
          {item.instances.length === 0 ? (
            <PlatformState
              icon={PlugZap}
              title="Nenhuma instância ativa"
              description="Este workspace ainda não possui uma instância Baileys persistida."
            />
          ) : (
            <div className="platform-member-list">
              {item.instances.map((instance: any) => (
                <div className="platform-member" key={instance.id}>
                  <div className="platform-channel-icon">
                    <PlugZap size={15} />
                  </div>
                  <div>
                    <strong>{instance.name}</strong>
                    <small>
                      {instance.instanceId} · atualizado {fmtDate(instance.updatedAt)}
                    </small>
                  </div>
                  <WorkspaceStatus value={instance.status} />
                  <button
                    className="btn-ghost"
                    disabled={!canMutate || disconnect.isPending}
                    onClick={() => {
                      if (!window.confirm(`Desconectar ${instance.name}?`)) return;
                      disconnect.mutate({
                        workspaceId: item.workspace.id,
                        sessionId,
                        instanceId: instance.instanceId,
                        logout: false,
                        reason: "Desconexão solicitada pelo suporte",
                      });
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="platform-support-actions" style={{ marginTop: 14 }}>
            <input
              className="input-control"
              value={instanceName}
              onChange={event => setInstanceName(event.target.value)}
              placeholder="Nome da nova instância"
              disabled={!canMutate || createInstance.isPending}
              aria-label="Nome da nova instância Baileys"
            />
            <button
              className="btn-secondary"
              disabled={!canMutate || createInstance.isPending || instanceName.trim().length < 2}
              onClick={() =>
                createInstance.mutate({
                  workspaceId: item.workspace.id,
                  sessionId,
                  name: instanceName.trim(),
                  reason: "Criação de instância pelo suporte",
                })
              }
            >
              {createInstance.isPending ? "Criando…" : "Criar instância"}
            </button>
          </div>
          {item.instances.length > 0 && (
            <div className="platform-support-actions" style={{ marginTop: 14 }}>
              <input
                className="input-control"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="Telefone com DDI e DDD"
                disabled={!canMutate || pair.isPending}
                aria-label="Telefone para pareamento Baileys"
              />
              <button
                className="btn-secondary"
                disabled={!canMutate || pair.isPending || phone.trim().length < 8}
                onClick={() =>
                  pair.mutate({
                    workspaceId: item.workspace.id,
                    sessionId,
                    instanceId: item.instances[0].instanceId,
                    phone: phone.trim(),
                    reason: "Smoke test Baileys iniciado pelo Console Admin",
                  })
                }
              >
                {pair.isPending ? "Gerando…" : "Gerar código"}
              </button>
              {pairingCode && <code className="platform-pairing-code">{pairingCode}</code>}
            </div>
          )}
          <div className="platform-safe-note">
            <ShieldCheck size={13} /> Somente status e identificadores operacionais; sessão e credenciais ficam no gateway.
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
  onRefresh,
  canMutate,
}: {
  item: any;
  input: { workspaceId: number; sessionId: number };
  onRefresh: () => void;
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
    onSuccess: result => {
      setEnabled(result.config.enabled);
      setModel(result.config.model);
      setPrompt(result.config.systemPrompt);
      setMaxSteps(result.config.maxSteps);
      toast.success("Rascunho salvo");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const publish = trpc.platform.publishAgentDraft.useMutation({
    onSuccess: result => {
      setEnabled(result.config.enabled);
      setModel(result.config.model);
      setPrompt(result.config.systemPrompt);
      setMaxSteps(result.config.maxSteps);
      toast.success("Versão publicada");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const simulate = trpc.platform.simulateAgent.useMutation({
    onSuccess: () => {
      toast.success("Simulação concluída");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const rollback = trpc.platform.rollbackAgent.useMutation({
    onSuccess: result => {
      setEnabled(result.config.enabled);
      setModel(result.config.model);
      setPrompt(result.config.systemPrompt);
      setMaxSteps(result.config.maxSteps);
      toast.success("Rollback publicado como nova versão");
      onRefresh();
    },
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
            a simulação local não chama o gateway Baileys nem nenhum modelo externo.
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

export function PlatformGlobalAiPage() {
  const access = trpc.platform.access.useQuery();
  return (
    <PlatformAccessGate>
      <PlatformShell
        title="IA global"
        description="Cadastre a conexão de cada modelo para uma função específica do sistema."
        active="ai"
      >
        <div className="platform-banner">
          <Sparkles size={17} />
          <div>
            <strong>Conexões por função, sem configuração espalhada</strong>
            <span>O roteador escolherá a conexão cadastrada para responder no WhatsApp, transcrever áudio, analisar imagem/documento ou apoiar o Console.</span>
          </div>
        </div>
        <AiConnectionsCard canMutate={Boolean(access.data?.canMutate)} />
      </PlatformShell>
    </PlatformAccessGate>
  );
}

export function PlatformSupportPage() {
  const [, navigate] = useLocation();
  const workspaces = trpc.platform.workspaces.useQuery({ search: "" }, { refetchInterval: 30_000 });
  const start = trpc.platform.startSupportSession.useMutation({
    onSuccess: (session, input) => navigate(`/platform-admin/workspaces/${input.workspaceId}?session=${session.id}`),
    onError: error => toast.error(error.message),
  });
  return (
    <PlatformAccessGate>
      <PlatformShell
        title="Suporte operacional"
        description="Abra sessões escopadas para investigar workspaces sem misturar permissões de plataforma e cliente."
        active="support"
      >
        <section className="platform-card">
          <div className="platform-card-title"><div><span className="eyebrow">Fila de atendimento</span><h2>Workspaces disponíveis para suporte</h2></div><LifeBuoy size={18} /></div>
          {workspaces.isLoading ? <PlatformState icon={RefreshCw} title="Carregando fila" description="Consultando saúde e status dos workspaces." loading /> : workspaces.error ? <PlatformState icon={XCircle} title="Fila indisponível" description={workspaces.error.message} /> : (
            <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Workspace</th><th>Status</th><th>Canal</th><th>Worker</th><th /></tr></thead><tbody>{(workspaces.data?.items ?? []).map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.slug}</small></td><td><WorkspaceStatus value={item.status} /></td><td><WorkspaceStatus value={item.health.channel} /></td><td><WorkspaceStatus value={item.health.worker} /></td><td><button className="btn-secondary" disabled={start.isPending} onClick={() => start.mutate({ workspaceId: item.id, mode: "read_only", reason: "Triagem operacional pelo console da plataforma", expiresInMinutes: 30 })}><LifeBuoy size={13} /> Abrir read-only</button></td></tr>)}</tbody></table></div>
          )}
        </section>
      </PlatformShell>
    </PlatformAccessGate>
  );
}

export function PlatformSupportInstancesPage() {
  const [name, setName] = useState("WhatsApp Suporte");
  const [phone, setPhone] = useState("");
  const [promptInstanceId, setPromptInstanceId] = useState("");
  const [promptText, setPromptText] = useState("");
  const snapshot = trpc.platform.supportWorkspace.useQuery(undefined, { refetchInterval: 5_000 });
  const globalAi = trpc.platform.globalAiConfig.useQuery();
  const promptBindings = trpc.platform.supportPromptBindings.useQuery();
  const create = trpc.platform.createSupportInstance.useMutation({ onSuccess: () => snapshot.refetch(), onError: error => toast.error(error.message) });
  const pair = trpc.platform.requestSupportPairingCode.useMutation({ onError: error => toast.error(error.message) });
  const disconnect = trpc.platform.disconnectSupportInstance.useMutation({ onSuccess: () => snapshot.refetch(), onError: error => toast.error(error.message) });
  const savePromptBinding = trpc.platform.saveSupportPromptBinding.useMutation({ onSuccess: () => promptBindings.refetch(), onError: error => toast.error(error.message) });
  const canMutate = Boolean(trpc.platform.access.useQuery().data?.canMutate);
  const selectedPromptBinding = promptBindings.data?.find(item => item.instanceId === promptInstanceId);
  useEffect(() => {
    setPromptText(selectedPromptBinding?.systemPrompt ?? globalAi.data?.systemPrompt ?? "");
  }, [selectedPromptBinding?.systemPrompt, globalAi.data?.systemPrompt]);
  return (
    <PlatformAccessGate>
      <PlatformShell title="Instâncias de suporte" description="Conexões Baileys próprias da operação da plataforma, fora dos Workspaces beta." active="support-instances">
        <div className="platform-banner"><ShieldCheck size={17} /><div><strong>Tenant interno: {snapshot.data?.workspace.name ?? "Suporte Forte Platform"}</strong><span>Estas instâncias pertencem ao Console Admin e não a uma conta de cliente.</span></div></div>
        <section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Nova conexão</span><h2>Adicionar instância de suporte</h2></div><PlugZap size={18} /></div><div className="platform-form-grid"><label className="platform-field"><span>Nome</span><input className="input-control" value={name} onChange={event => setName(event.target.value)} /></label><div className="platform-form-actions"><button className="btn-primary" disabled={!canMutate || create.isPending || name.trim().length < 2} onClick={() => create.mutate({ name })}><PlugZap size={13} /> {create.isPending ? "Criando…" : "Criar instância"}</button></div></div></section>
        <section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Conexões do console</span><h2>WhatsApp de suporte</h2></div><Activity size={18} /></div>{snapshot.isLoading ? <PlatformState icon={RefreshCw} title="Carregando instâncias" description="Consultando o tenant interno do suporte." loading /> : (snapshot.data?.instances ?? []).length === 0 ? <PlatformState icon={PlugZap} title="Nenhuma instância criada" description="Crie a primeira conexão própria do Console Admin." /> : <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Instância</th><th>Status</th><th>Pairing</th><th /></tr></thead><tbody>{(snapshot.data?.instances ?? []).map(instance => <tr key={instance.instanceId}><td><strong>{instance.name}</strong><small>{instance.instanceId}</small></td><td><WorkspaceStatus value={instance.status} /></td><td><div className="platform-form-actions"><input className="input-control" placeholder="DDD + número" value={phone} onChange={event => setPhone(event.target.value)} /><button className="btn-secondary" disabled={!canMutate || pair.isPending || phone.length < 8} onClick={() => pair.mutate({ instanceId: instance.instanceId, phone })}><KeyRound size={13} /> Código</button></div></td><td><button className="btn-ghost" disabled={!canMutate || disconnect.isPending} onClick={() => disconnect.mutate({ instanceId: instance.instanceId, logout: false })}>Desconectar</button></td></tr>)}</tbody></table></div>}</section>
        <section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Prompt global por conexão</span><h2>Parear prompt à instância</h2></div><Bot size={18} /></div><p className="platform-muted">A edição completa, leitura e ativação por instância também estão disponíveis na aba <strong>Prompts por instância</strong>.</p><div className="platform-form-grid"><label className="platform-field"><span>Instância</span><select className="input-control" value={promptInstanceId} onChange={event => setPromptInstanceId(event.target.value)}><option value="">Selecione uma instância</option>{(snapshot.data?.instances ?? []).map(instance => <option key={instance.instanceId} value={instance.instanceId}>{instance.name}</option>)}</select></label><label className="platform-field"><span>System prompt</span><textarea className="input-control agent-prompt-editor" value={promptText} onChange={event => setPromptText(event.target.value)} disabled={!promptInstanceId} placeholder="Prompt global de suporte desta instância" /></label></div><div className="platform-form-actions"><button className="btn-primary" disabled={!canMutate || !promptInstanceId || !promptText.trim() || savePromptBinding.isPending} onClick={() => savePromptBinding.mutate({ instanceId: promptInstanceId, enabled: true, model: globalAi.data?.model ?? "gpt-5-mini", systemPrompt: promptText, maxSteps: globalAi.data?.maxSteps ?? 6, reason: "Pareamento e ativação do prompt global à instância de suporte" })}>Salvar e ativar prompt</button>{selectedPromptBinding && <span className="platform-muted">v{selectedPromptBinding.version} salvo; agente ativo nesta instância</span>}</div></section>
      </PlatformShell>
    </PlatformAccessGate>
  );
}

export function PlatformSupportInboxPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const contacts = trpc.platform.supportContacts.useQuery(undefined, { refetchInterval: 5_000 });
  const thread = trpc.platform.supportThread.useQuery({ contactId: selectedId ?? 0 }, { enabled: selectedId !== null, refetchInterval: 5_000 });
  const agent = trpc.platform.supportAgent.useQuery();
  const savePrompt = trpc.platform.saveSupportPrompt.useMutation({ onSuccess: () => agent.refetch(), onError: error => toast.error(error.message) });
  const publishPrompt = trpc.platform.publishSupportPrompt.useMutation({ onSuccess: () => agent.refetch(), onError: error => toast.error(error.message) });
  const send = trpc.platform.sendSupportMessage.useMutation({ onSuccess: () => { setDraft(""); thread.refetch(); contacts.refetch(); }, onError: error => toast.error(error.message) });
  const canMutate = Boolean(trpc.platform.access.useQuery().data?.canMutate);
  const selected = contacts.data?.find(contact => Number(contact.id) === selectedId);
  const prompt = agent.data?.draft?.config ?? agent.data?.current;
  const [promptText, setPromptText] = useState("");
  useEffect(() => {
    if (prompt?.systemPrompt !== undefined) setPromptText(prompt.systemPrompt);
  }, [prompt?.systemPrompt]);
  return (
    <PlatformAccessGate>
      <PlatformShell title="Inbox de suporte" description="Mensagens recebidas nas instâncias próprias do Console Admin, com agente e prompt separados." active="support-inbox">
        <div className="platform-banner"><MessageSquareText size={17} /><div><strong>Atendimento do Console Admin</strong><span>Esta Inbox usa somente o tenant interno de suporte; Workspaces beta não aparecem aqui.</span></div></div>
        <div className="platform-two-columns"><section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Conversas</span><h2>WhatsApp de suporte</h2></div></div>{(contacts.data ?? []).map(contact => <button key={contact.id} className={`platform-member ${selectedId === Number(contact.id) ? "is-active" : ""}`} onClick={() => setSelectedId(Number(contact.id))}><div className="platform-channel-icon"><MessageSquareText size={14} /></div><div><strong>{contact.name}</strong><small>{contact.phone || "Grupo"} · {contact.lastMessage}</small></div></button>)}</section><section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Conversa</span><h2>{selected?.name ?? "Selecione uma conversa"}</h2></div></div>{selectedId === null ? <PlatformState icon={MessageSquareText} title="Inbox pronta" description="Quando o WhatsApp de suporte receber uma mensagem, ela aparecerá aqui." /> : <><div className="platform-note-list">{(thread.data?.messages ?? []).map(message => <div key={message.id}><strong>{message.sender}</strong><small>{fmtDate(message.time)}</small><p>{message.text}</p></div>)}</div><div className="platform-form-actions"><input className="input-control" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Responder pelo WhatsApp de suporte" /><button className="btn-primary" disabled={!canMutate || send.isPending || !draft.trim()} onClick={() => send.mutate({ contactId: selectedId, content: draft })}>Enviar</button></div></>}</section></div>
        <section className="platform-card"><div className="platform-card-title"><div><span className="eyebrow">Agente próprio</span><h2>Prompt do suporte da plataforma</h2></div><Bot size={18} /></div>{prompt && <><textarea className="input-control agent-prompt-editor" value={promptText} onChange={event => setPromptText(event.target.value)} /><div className="platform-form-actions"><button className="btn-secondary" disabled={!canMutate || savePrompt.isPending} onClick={() => savePrompt.mutate({ enabled: prompt.enabled, model: prompt.model, systemPrompt: promptText, maxSteps: prompt.maxSteps })}>Salvar rascunho</button><button className="btn-primary" disabled={!canMutate || publishPrompt.isPending} onClick={() => publishPrompt.mutate()}>Publicar prompt</button></div></>}</section>
      </PlatformShell>
    </PlatformAccessGate>
  );
}

export function PlatformPromptsPage() {
  const access = trpc.platform.access.useQuery();
  const globalAi = trpc.platform.globalAiConfig.useQuery();
  const workspace = trpc.platform.supportWorkspace.useQuery();
  const bindings = trpc.platform.supportPromptBindings.useQuery();
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [instancePrompt, setInstancePrompt] = useState("");
  const [instanceEnabled, setInstanceEnabled] = useState(false);
  const [reason, setReason] = useState("Atualização do prompt global do suporte");
  const globalSave = trpc.platform.saveGlobalPrompt.useMutation({
    onSuccess: result => {
      setGlobalPrompt(result.systemPrompt);
      globalAi.refetch();
      toast.success("Prompt global salvo");
    },
    onError: error => toast.error(error.message),
  });
  const bindingSave = trpc.platform.saveSupportPromptBinding.useMutation({
    onSuccess: result => {
      setInstancePrompt(result.systemPrompt);
      setInstanceEnabled(result.enabled);
      bindings.refetch();
      toast.success(`Prompt da instância salvo na versão ${result.version}`);
    },
    onError: error => toast.error(error.message),
  });
  const selectedBinding = bindings.data?.find(item => item.instanceId === instanceId);
  const canMutate = Boolean(access.data?.canMutate);
  useEffect(() => {
    if (globalAi.data?.systemPrompt !== undefined && !globalPrompt)
      setGlobalPrompt(globalAi.data.systemPrompt);
  }, [globalAi.data?.systemPrompt, globalPrompt]);
  useEffect(() => {
    setInstancePrompt(
      selectedBinding?.systemPrompt ?? globalAi.data?.systemPrompt ?? ""
    );
    setInstanceEnabled(selectedBinding?.enabled ?? false);
  }, [selectedBinding?.systemPrompt, selectedBinding?.enabled, globalAi.data?.systemPrompt]);
  return (
    <PlatformAccessGate>
      <PlatformShell
        title="Prompts por instância"
        description="Biblioteca global de prompts do suporte e vínculo explícito com cada conexão WhatsApp."
        active="prompts"
      >
        <div className="platform-banner">
          <Sparkles size={17} />
          <div>
            <strong>IA do Console Admin</strong>
            <span>
              O agente responde no chat somente quando a IA global e o vínculo da instância estão ativos.
            </span>
          </div>
        </div>
        <section className="platform-card">
          <div className="platform-card-title">
            <div>
              <span className="eyebrow">Fonte global</span>
              <h2>Prompt padrão do suporte</h2>
            </div>
            <Bot size={18} />
          </div>
          <p className="platform-muted">
            Este texto é o padrão usado para preencher novos vínculos. O modelo e as conexões de IA continuam na aba IA global.
          </p>
          <textarea
            className="textarea-control agent-prompt-editor"
            value={globalPrompt}
            onChange={event => setGlobalPrompt(event.target.value)}
            placeholder="Defina as regras globais do agente de suporte…"
          />
          <div className="platform-form-actions">
            <button
              className="btn-primary"
              disabled={!canMutate || globalSave.isPending || !globalPrompt.trim()}
              onClick={() => globalSave.mutate({ systemPrompt: globalPrompt, reason })}
            >
              <FileText size={14} /> Salvar prompt global
            </button>
          </div>
        </section>
        <section className="platform-card">
          <div className="platform-card-title">
            <div>
              <span className="eyebrow">Vínculo de runtime</span>
              <h2>Prompt desta instância</h2>
            </div>
            <PlugZap size={18} />
          </div>
          <div className="platform-form-grid">
            <label className="platform-field">
              <span>Instância WhatsApp</span>
              <select
                className="select-control"
                value={instanceId}
                onChange={event => setInstanceId(event.target.value)}
              >
                <option value="">Selecione uma instância</option>
                {(workspace.data?.instances ?? []).map(instance => (
                  <option key={instance.instanceId} value={instance.instanceId}>
                    {instance.name} — {instance.instanceId}
                  </option>
                ))}
              </select>
            </label>
            <label className="platform-field">
              <span>Estado do agente nesta instância</span>
              <select
                className="select-control"
                value={instanceEnabled ? "enabled" : "paused"}
                onChange={event => setInstanceEnabled(event.target.value === "enabled")}
                disabled={!instanceId}
              >
                <option value="enabled">Ativo — responder no chat</option>
                <option value="paused">Pausado</option>
              </select>
            </label>
            <label className="platform-field full">
              <span>System prompt pareado</span>
              <textarea
                className="textarea-control agent-prompt-editor"
                value={instancePrompt}
                onChange={event => setInstancePrompt(event.target.value)}
                disabled={!instanceId}
                placeholder="Selecione uma instância para editar o prompt…"
              />
            </label>
            <label className="platform-field full">
              <span>Motivo da alteração</span>
              <input className="input-control" value={reason} onChange={event => setReason(event.target.value)} />
            </label>
          </div>
          <div className="platform-form-actions">
            <button
              className="btn-primary"
              disabled={!canMutate || !instanceId || !instancePrompt.trim() || bindingSave.isPending}
              onClick={() => bindingSave.mutate({
                instanceId,
                enabled: instanceEnabled,
                model: globalAi.data?.model ?? "gpt-5-mini",
                systemPrompt: instancePrompt,
                maxSteps: globalAi.data?.maxSteps ?? 6,
                reason,
              })}
            >
              <Sparkles size={14} /> Salvar e ativar vínculo
            </button>
            {selectedBinding && <span className="platform-muted">Versão {selectedBinding.version} · atualizado {fmtDate(selectedBinding.updatedAt)}</span>}
          </div>
        </section>
      </PlatformShell>
    </PlatformAccessGate>
  );
}

export function PlatformAuditPage() {
  const audit = trpc.platform.globalAudit.useQuery({ limit: 100 }, { refetchInterval: 30_000 });
  return (
    <PlatformAccessGate>
      <PlatformShell
        title="Auditoria da plataforma"
        description="Histórico de alterações globais, sessões de suporte e decisões operacionais."
        active="audit"
      >
        <section className="platform-card">
          <div className="platform-card-title"><div><span className="eyebrow">Trilha imutável</span><h2>Eventos globais recentes</h2></div><FileText size={18} /></div>
          {audit.isLoading ? <PlatformState icon={RefreshCw} title="Carregando auditoria" description="Consultando eventos globais." loading /> : audit.error ? <PlatformState icon={XCircle} title="Auditoria indisponível" description={audit.error.message} /> : (audit.data ?? []).length === 0 ? <PlatformState icon={FileText} title="Nenhum evento global" description="As ações de plataforma aparecerão aqui após a primeira alteração auditada." /> : <div className="platform-audit-list">{(audit.data ?? []).map(item => <div key={item.id}><strong>{item.summary}</strong><small>{item.actorName ?? "Operador desconhecido"} · {fmtDate(item.createdAt)}</small><p>{item.action} · {item.reason}</p></div>)}</div>}
        </section>
      </PlatformShell>
    </PlatformAccessGate>
  );
}
