import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Filter,
  Gauge,
  Headphones,
  Info,
  KanbanSquare,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  UsersRound,
  WalletCards,
  Wifi,
  WifiOff,
  Zap,
  X,
} from "lucide-react";
import PanelLayout, {
  EmptyState,
  PageLink,
  SectionTitle,
  StatusBadge,
  ViewToggle,
} from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import {
  appointments,
  contacts,
  events,
  formatCurrency,
  getContact,
  integrations,
  quotes,
  stageOrder,
  type Contact,
  type Message,
  type Stage,
} from "@/lib/demoData";

function DemoBanner() {
  return (
    <div className="demo-banner operational-banner">
      <CheckCircle2 size={15} />
      <span>
        <strong>Operação conectada:</strong> dados persistidos no CRM; mensagens
        externas passam pela fila e pelo worker configurado.
      </span>
    </div>
  );
}

function ChannelStatusBanner({
  loading,
  channel,
}: {
  loading: boolean;
  channel?: {
    provider: string;
    configured: boolean;
    active: boolean;
    phoneNumber?: string | null;
  };
}) {
  if (loading)
    return (
      <div className="channel-status-banner is-loading">
        <Wifi size={15} /> <span>Verificando conexão do canal...</span>
      </div>
    );
  const ready = Boolean(channel?.configured && channel?.active);
  return (
    <div
      className={`channel-status-banner ${ready ? "is-ready" : "is-warning"}`}
    >
      {ready ? <Wifi size={15} /> : <WifiOff size={15} />}
      <div>
        <strong>
          {ready
            ? "Canal pronto para atendimento"
            : "Canal ainda não está pronto"}
        </strong>
        <span>
          {ready
            ? `${channel?.provider === "baileys" ? "Baileys nativo" : "Meta Cloud API"}${channel?.phoneNumber ? ` · ${channel.phoneNumber}` : ""}. Mídia básica e mensagens passam pelo worker.`
            : "Configure e ative um canal em Integrações antes de esperar envio ou recebimento real."}
        </span>
      </div>
    </div>
  );
}

function BaileysConnectionCard() {
  const utils = trpc.useUtils();
  const cardRef = useRef<HTMLElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const status = trpc.workspace.baileysStatus.useQuery(undefined, {
    refetchInterval: 4_000,
  });
  const current = status.data;
  const waitingQr = current?.status === "qr";
  const qrIssuedAt = current?.updatedAt ? Date.parse(current.updatedAt) : NaN;
  const qrExpiresAt = Number.isFinite(qrIssuedAt) ? qrIssuedAt + 60_000 : NaN;
  const qrExpired = waitingQr && Number.isFinite(qrExpiresAt) && now >= qrExpiresAt;
  const remainingSeconds = Number.isFinite(qrExpiresAt)
    ? Math.max(0, Math.ceil((qrExpiresAt - now) / 1000))
    : null;
  const qr = trpc.workspace.baileysQr.useQuery(undefined, {
    enabled: waitingQr && !qrExpired,
    refetchInterval: 3_000,
    retry: false,
  });
  const connect = trpc.workspace.connectBaileys.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workspace.baileysStatus.invalidate(),
        utils.workspace.baileysQr.invalidate(),
      ]);
    },
  });
  const disconnect = trpc.workspace.disconnectBaileys.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workspace.baileysStatus.invalidate(),
        utils.workspace.baileysQr.invalidate(),
      ]);
    },
  });
  useEffect(() => {
    if (!waitingQr) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [waitingQr]);
  useEffect(() => {
    if (!waitingQr || !current?.updatedAt) return;
    const timer = window.setTimeout(() => {
      qrRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      qrRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [waitingQr, current?.updatedAt]);
  const labels: Record<string, string> = {
    unconfigured: "Gateway não configurado",
    idle: "Aguardando conexão",
    connecting: "Iniciando conexão",
    qr: qrExpired ? "QR expirado" : "Aguardando leitura do QR Code",
    connected: "WhatsApp conectado",
    disconnected: "Desconectado",
    logged_out: "Sessão encerrada",
    error: "Erro na conexão",
  };
  const connected = current?.status === "connected";
  const retrying = connect.isPending || current?.status === "connecting";
  return (
    <section
      ref={cardRef}
      className="surface whatsapp-connection-card"
      aria-labelledby="whatsapp-connection-title"
    >
      <SectionTitle
        eyebrow="Conexão WhatsApp"
        title="Conecte uma única instância"
        action={
          <StatusBadge tone={connected ? "green" : waitingQr && !qrExpired ? "amber" : current?.status === "error" ? "red" : "neutral"}>
            {labels[current?.status ?? "idle"] ?? current?.status ?? "Verificando"}
          </StatusBadge>
        }
      />
      <h2 id="whatsapp-connection-title" className="sr-only">Conexão WhatsApp</h2>
      {status.isLoading ? (
        <div className="muted" role="status">Consultando o gateway...</div>
      ) : status.error ? (
        <div className="form-error" role="alert">{status.error.message}</div>
      ) : !current?.configured ? (
        <div className="demo-banner" style={{ marginBottom: 0 }}>
          <Info size={14} /> Configure o gateway no ambiente do servidor para habilitar a conexão.
        </div>
      ) : (
        <div className="qr-connection-layout">
          <div className="whatsapp-connection-copy">
            <p className="muted">
              Esta conta usa uma instância WhatsApp por vez. Abra o WhatsApp no
              celular, vá em <strong>Dispositivos conectados</strong> e leia o QR.
            </p>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="form-field">
                <label>Instância</label>
                <input className="input-control" value={current.instanceId} readOnly />
              </div>
              <div className="form-field">
                <label>Número conectado</label>
                <input className="input-control" value={current.phoneNumber ?? "Aguardando leitura"} readOnly />
              </div>
            </div>
            <div className="qr-actions" style={{ marginTop: 16 }}>
              {!connected && (
                <button
                  className="btn-primary"
                  disabled={retrying}
                  onClick={() => connect.mutate()}
                >
                  <RefreshCw size={14} />
                  {connect.isPending ? "Gerando novo QR..." : current.status === "qr" ? "Atualizar QR Code" : "Conectar WhatsApp"}
                </button>
              )}
              {connected && (
                <button className="btn-secondary" disabled={disconnect.isPending} onClick={() => disconnect.mutate({ logout: false })}>
                  Desconectar temporariamente
                </button>
              )}
              {connected && (
                <button className="btn-ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate({ logout: true })}>
                  Encerrar sessão do WhatsApp
                </button>
              )}
            </div>
            {connect.error && <div className="form-error" role="alert">{connect.error.message}</div>}
            {disconnect.error && <div className="form-error" role="alert">{disconnect.error.message}</div>}
            {current.lastError && <div className="form-error" role="alert">{current.lastError}</div>}
          </div>
          <div
            ref={qrRef}
            className={`qr-code-panel ${qrExpired ? "is-expired" : ""}`}
            tabIndex={-1}
            aria-live="polite"
            aria-label="Estado do QR Code do WhatsApp"
          >
            {waitingQr && !qrExpired && qr.data ? (
              <>
                <img src={qr.data} alt="QR Code para conectar o WhatsApp" />
                <small className="qr-expiry">Expira em {remainingSeconds ?? "—"} s</small>
              </>
            ) : waitingQr && !qrExpired ? (
              <div className="muted"><QrCode size={28} /> Gerando QR Code...</div>
            ) : qrExpired ? (
              <div className="muted"><QrCode size={28} /> QR expirado. Gere um novo código.</div>
            ) : connected ? (
              <div className="muted"><CheckCircle2 size={28} /> Número conectado.</div>
            ) : (
              <div className="muted"><QrCode size={28} /> O QR Code aparecerá aqui.</div>
            )}
            {qr.error && !qrExpired && <small className="qr-error">QR aguardando atualização do gateway.</small>}
          </div>
        </div>
      )}
    </section>
  );
}
function StatCard({
  label,
  value,
  foot,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  foot: string;
  icon: typeof UsersRound;
  tone?: string;
}) {
  return (
    <div className="surface surface-hover stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-foot">{foot}</span>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  if (type === "calendar") return <CalendarCheck2 size={15} />;
  if (type === "kanban") return <KanbanSquare size={15} />;
  if (type === "billing") return <CircleDollarSign size={15} />;
  return <MessageCircle size={15} />;
}

type ContactLike = Omit<Contact, "stage"> & { stage: string };

function formatChatTime(value: string) {
  if (value === "agora" || value === "ontem") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  const dashboardQuery = trpc.dashboard.snapshot.useQuery();
  const snapshot = dashboardQuery.data;
  const money = (cents: number) => formatCurrency(cents / 100);
  return (
    <PanelLayout
      eyebrow="Operação / Overview"
      title="Dashboard"
      description="Acompanhe o atendimento do Gabriel em um único lugar."
    >
      <div className="stat-grid">
        <PageLink href="/contacts">
          <StatCard
            label="Novos contatos hoje"
            value={String(snapshot?.newContactsToday ?? 0).padStart(2, "0")}
            foot="Base persistente"
            icon={UsersRound}
            tone="blue"
          />
        </PageLink>
        <PageLink href="/inbox">
          <StatCard
            label="Aguardando resposta"
            value={String(snapshot?.awaitingResponse ?? 0).padStart(2, "0")}
            foot="Última resposta enviada"
            icon={MessageCircle}
            tone="amber"
          />
        </PageLink>
        <PageLink href="/inbox">
          <StatCard
            label="IA pausada"
            value={String(snapshot?.aiPaused ?? 0).padStart(2, "0")}
            foot="Controle humano ativo"
            icon={Pause}
            tone="amber"
          />
        </PageLink>
        <PageLink href="/kanban">
          <StatCard
            label="Urgências abertas"
            value={String(snapshot?.urgentOpen ?? 0).padStart(2, "0")}
            foot="Alta ou crítica"
            icon={Zap}
            tone="red"
          />
        </PageLink>
        <PageLink href="/billing">
          <StatCard
            label="Orçamentos pendentes"
            value={money(snapshot?.quotesPendingCents ?? 0)}
            foot="Soma registrada no CRM"
            icon={FileText}
            tone="blue"
          />
        </PageLink>
        <PageLink href="/agenda">
          <StatCard
            label="Agendamentos hoje"
            value={String(snapshot?.appointmentsToday ?? 0).padStart(2, "0")}
            foot="Agenda nativa"
            icon={CalendarCheck2}
            tone="green"
          />
        </PageLink>
        <PageLink href="/billing">
          <StatCard
            label="Recebido no mês"
            value={money(snapshot?.receivedMonthCents ?? 0)}
            foot="Controle financeiro manual"
            icon={WalletCards}
            tone="green"
          />
        </PageLink>
        <PageLink href="/billing">
          <StatCard
            label="Valor pendente"
            value={money(snapshot?.pendingCents ?? 0)}
            foot="Orçamentos em aberto"
            icon={CircleDollarSign}
            tone="amber"
          />
        </PageLink>
      </div>
      <div className="dashboard-grid">
        <section>
          <SectionTitle
            eyebrow="Atividade recente"
            title="Últimos eventos"
            action={
              <PageLink href="/inbox" className="btn-ghost">
                Ver tudo <ArrowUpRight size={13} />
              </PageLink>
            }
          />
          <div className="surface" style={{ padding: "0 17px" }}>
            {(snapshot?.recentEvents ?? []).length > 0 ? (
              snapshot?.recentEvents.map(event => (
                <div className="event-row" key={event.id}>
                  <div className="event-icon">
                    <EventIcon
                      type={
                        event.action.includes("stage")
                          ? "kanban"
                          : event.action.includes("message")
                            ? "message"
                            : "calendar"
                      }
                    />
                  </div>
                  <div className="row-copy">
                    <strong>{event.action}</strong>
                    <small>{event.summary}</small>
                  </div>
                  <span className="row-meta">
                    {formatChatTime(event.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Clock3}
                title="Sem atividade ainda"
                description="As ações do atendimento aparecerão aqui."
              />
            )}
          </div>
        </section>
        <section>
          <SectionTitle
            eyebrow="Próximos horários"
            title="Agenda"
            action={
              <PageLink href="/agenda" className="btn-ghost">
                Abrir agenda <ArrowUpRight size={13} />
              </PageLink>
            }
          />
          <div className="surface" style={{ padding: "0 17px" }}>
            {(snapshot?.upcomingAppointments ?? []).length > 0 ? (
              snapshot?.upcomingAppointments.map(appointment => (
                <div className="appointment-row" key={appointment.id}>
                  <div className="time-block">
                    {new Date(appointment.startsAt).toLocaleTimeString(
                      "pt-BR",
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </div>
                  <div className="row-copy">
                    <strong>Atendimento #{appointment.id}</strong>
                    <small>
                      {new Date(appointment.startsAt).toLocaleDateString(
                        "pt-BR"
                      )}{" "}
                      · {appointment.notes ?? "Sem observações"}
                    </small>
                  </div>
                  <StatusBadge
                    tone={
                      appointment.status === "confirmed" ? "green" : "amber"
                    }
                  >
                    {appointment.status}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <EmptyState
                icon={CalendarCheck2}
                title="Agenda livre"
                description="Nenhum próximo horário confirmado."
              />
            )}
          </div>
        </section>
      </div>
    </PanelLayout>
  );
}

function ConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: ContactLike[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="inbox-list">
      <div className="inbox-list-header">
        <span className="eyebrow">Conversas</span>
        <div className="inbox-count">{items.length} conversas indexadas</div>
      </div>
      {items.map(contact => (
        <button
          key={contact.id}
          onClick={() => onSelect(contact.id)}
          className={`conversation-item ${selectedId === contact.id ? "is-selected" : ""}`}
        >
          <div className="avatar">{contact.initials}</div>
          <div className="conversation-copy">
            <div className="conversation-title">
              <strong>{contact.name}</strong>
              {contact.unread > 0 && (
                <span className="unread-pill">{contact.unread}</span>
              )}
            </div>
            <div className="conversation-preview">{contact.lastMessage}</div>
            <div className="conversation-bottom">
              <span>{formatChatTime(contact.lastMessageAt)}</span>
              <span
                className={`ai-indicator ${contact.aiEnabled ? "" : "paused"}`}
              >
                {contact.aiEnabled ? "IA ativa" : "IA pausada"}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const author =
    message.sender === "lead"
      ? "Lead"
      : message.sender === "ai"
        ? "IA automática"
        : message.sender === "human"
          ? "Gabriel"
          : "Sistema";
  const time = message.time.includes("T")
    ? new Date(message.time).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : message.time;
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? message.metadata
      : {};
  const mediaUrlValue =
    typeof metadata.mediaUrl === "string"
      ? metadata.mediaUrl
      : typeof metadata.mediaData === "string"
        ? metadata.mediaData
        : message.messageType === "audio"
          ? message.text
          : "";
  const safeMediaUrl = (() => {
    if (
      /^data:(image|audio|video)\//i.test(mediaUrlValue) ||
      /^data:application\/pdf;/i.test(mediaUrlValue)
    )
      return mediaUrlValue;
    try {
      const url = new URL(mediaUrlValue);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : "";
    } catch {
      return "";
    }
  })();
  const buttons = Array.isArray(metadata.buttons)
    ? (metadata.buttons as Array<{ id?: string; displayText?: string }>)
    : [];
  const mediaLabel =
    typeof metadata.fileName === "string" && metadata.fileName
      ? metadata.fileName
      : message.messageType === "image"
        ? "Imagem recebida"
        : message.messageType === "video"
          ? "Vídeo recebido"
          : "Documento recebido";
  const structuredTypes = [
    "list",
    "poll",
    "location",
    "contact",
    "react",
    "sticker",
    "album",
    "event",
  ];
  const structuredPayload =
    metadata.payload && typeof metadata.payload === "object"
      ? (metadata.payload as Record<string, unknown>)
      : undefined;
  const structuredSummary = structuredPayload
    ? String(
        structuredPayload.title ??
          structuredPayload.text ??
          structuredPayload.name ??
          structuredPayload.caption ??
          "Payload estruturado recebido"
      )
    : "Payload estruturado recebido";
  return (
    <div className={`message-row from-${message.sender}`}>
      <div className="message-bubble">
        <div className="message-author">{author}</div>
        <div className="message-text">
          {message.messageType === "audio" && safeMediaUrl ? (
            <audio
              controls
              preload="none"
              src={safeMediaUrl}
              aria-label="Mensagem de áudio"
            />
          ) : message.messageType &&
            ["image", "video", "document"].includes(message.messageType) ? (
            safeMediaUrl ? (
              message.messageType === "image" ? (
                <img
                  className="message-media-image"
                  src={safeMediaUrl}
                  alt={mediaLabel}
                />
              ) : message.messageType === "video" ? (
                <video
                  className="message-media-video"
                  controls
                  preload="metadata"
                  src={safeMediaUrl}
                />
              ) : (
                <a href={safeMediaUrl} target="_blank" rel="noreferrer">
                  {mediaLabel}
                </a>
              )
            ) : (
              <span>{message.text || `[${mediaLabel}]`}</span>
            )
          ) : message.messageType &&
            structuredTypes.includes(message.messageType) &&
            structuredPayload ? (
            <div className="structured-message-preview">
              <StatusBadge tone="blue">{message.messageType}</StatusBadge>
              <strong>{structuredSummary}</strong>
            </div>
          ) : (
            message.text
          )}
          {buttons.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 8,
              }}
            >
              {buttons.map((button, index) => (
                <span
                  key={`${button.id ?? "option"}-${index}`}
                  className="btn-secondary"
                  style={{ cursor: "default", padding: "4px 8px" }}
                >
                  {button.displayText || button.id || `Opção ${index + 1}`}
                </span>
              ))}
            </div>
          )}
          {message.messageType === "button" &&
            typeof metadata.buttonText === "string" && (
              <div>{metadata.buttonText}</div>
            )}
        </div>
        <div className="message-time">
          {time}{" "}
          {message.sender !== "system" && (
            <Check
              size={10}
              style={{ display: "inline", verticalAlign: "middle" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationProfile({
  contact,
  onToggleAi,
}: {
  contact: ContactLike;
  onToggleAi: () => void;
}) {
  return (
    <div className="inbox-profile">
      <div className="profile-header">
        <h3>Ficha resumida</h3>
      </div>
      <div className="profile-body">
        <div className="profile-main">
          <div className="avatar">{contact.initials}</div>
          <h3>{contact.name}</h3>
          <p>{contact.phone}</p>
        </div>
        <div className="profile-fields">
          <div className="profile-field">
            <span>Serviço</span>
            <strong>{contact.service}</strong>
          </div>
          <div className="profile-field">
            <span>Local</span>
            <strong>
              {contact.neighborhood}, {contact.city}
            </strong>
          </div>
          <div className="profile-field">
            <span>Urgência</span>
            <strong
              className={
                contact.urgency === "Crítica" || contact.urgency === "Alta"
                  ? "red"
                  : "amber"
              }
            >
              {contact.urgency}
            </strong>
          </div>
          <div className="profile-field">
            <span>Estágio</span>
            <strong>{contact.stage}</strong>
          </div>
          <div className="profile-field">
            <span>Orçamento</span>
            <strong>{formatCurrency(contact.quote)}</strong>
          </div>
          <div className="profile-field">
            <span>Próxima ação</span>
            <strong>
              {contact.daysNoReply > 0 ? "Fazer follow-up" : "Aguardar retorno"}
            </strong>
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn-secondary" onClick={onToggleAi}>
            {contact.aiEnabled ? (
              <>
                <Pause size={13} /> Pausar IA
              </>
            ) : (
              <>
                <Play size={13} /> Reativar IA
              </>
            )}
          </button>
          <PageLink href={`/contacts/${contact.id}`} className="btn-secondary">
            <UserRound size={13} /> Abrir ficha completa
          </PageLink>
          <button className="btn-ghost">
            <Tag size={13} /> Adicionar nota
          </button>
        </div>
      </div>
    </div>
  );
}

export function InboxPage() {
  const [selectedId, setSelectedId] = useState("");
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Todos");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{
    name: string;
    type: "image" | "audio" | "video" | "document";
    mimeType: string;
    dataUrl: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const channelsQuery = trpc.workspace.channels.useQuery();
  const remoteContacts = contactsQuery.data ?? [];
  const items = remoteContacts;

  useEffect(() => {
    const requestedId = new URLSearchParams(location.split("?")[1] ?? "").get(
      "contactId"
    );
    if (requestedId && items.some(contact => contact.id === requestedId))
      setSelectedId(requestedId);
    else if (
      items.length > 0 &&
      !items.some(contact => contact.id === selectedId)
    )
      setSelectedId(items[0].id);
  }, [items, selectedId, location]);

  const selected = items.find(contact => contact.id === selectedId) ?? items[0];
  const selectedNumericId = Number(selected?.id ?? 0);
  const threadInput = useMemo(
    () => ({ contactId: selectedNumericId }),
    [selectedNumericId]
  );
  const threadQuery = trpc.inbox.thread.useQuery(threadInput, {
    enabled: selectedNumericId > 0,
  });
  const refresh = async () => {
    await Promise.all([contactsQuery.refetch(), threadQuery.refetch()]);
  };
  const toggleAiMutation = trpc.inbox.toggleAi.useMutation({
    onSuccess: refresh,
  });
  const sendMutation = trpc.inbox.sendMessage.useMutation({
    onSuccess: refresh,
  });
  const filtered = useMemo(
    () =>
      items.filter(
        contact =>
          `${contact.name} ${contact.phone}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (stageFilter === "Todos" || contact.stage === stageFilter)
      ),
    [items, search, stageFilter]
  );

  if (!selected)
    return (
      <PanelLayout
        eyebrow="Operação / Atendimento"
        title="Atendimento"
        description="Converse com seus clientes sem sair do painel."
      >
        {contactsQuery.isLoading ? (
          <EmptyState
            icon={MessageCircle}
            title="Carregando conversas"
            description="Buscando os contatos persistidos deste workspace."
          />
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="Nenhuma conversa encontrada"
            description="Quando o primeiro WhatsApp chegar, a conversa aparecerá aqui."
          />
        )}
      </PanelLayout>
    );

  const messages = threadQuery.data?.messages ?? [];
  const toggleAi = () => {
    toggleAiMutation.mutate({
      contactId: selectedNumericId,
      enabled: !selected.aiEnabled,
    });
  };
  const send = () => {
    if (!draft.trim() && !attachment) return;
    const currentAttachment = attachment;
    sendMutation.mutate({
      contactId: selectedNumericId,
      content: currentAttachment?.dataUrl ?? draft.trim(),
      messageType: currentAttachment?.type ?? "text",
      metadata: currentAttachment
        ? {
            mediaData: currentAttachment.dataUrl,
            mediaMimeType: currentAttachment.mimeType,
            fileName: currentAttachment.name,
            ...(draft.trim() ? { caption: draft.trim() } : {}),
          }
        : undefined,
    });
    setDraft("");
    setAttachment(null);
  };
  const selectAttachment = (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      window.alert("Escolha um arquivo de até 8 MB.");
      return;
    }
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        setAttachment({
          name: file.name,
          type,
          mimeType: file.type || "application/octet-stream",
          dataUrl: reader.result,
        });
    };
    reader.readAsDataURL(file);
  };
  return (
    <PanelLayout
      eyebrow="Operação / Atendimento"
      title="Atendimento"
      description="Converse com seus clientes sem sair do painel."
      actions={
        <PageLink href="/contacts" className="btn-primary">
          <Plus size={13} /> Nova conversa
        </PageLink>
      }
    >
      <DemoBanner />
      <ChannelStatusBanner
        loading={channelsQuery.isLoading}
        channel={(channelsQuery.data ?? []).find(
          channel => channel.provider === "baileys"
        )}
      />
      <div className="filter-bar">
        <div className="search-field">
          <Search size={14} />
          <input
            className="input-control"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por nome ou telefone"
          />
        </div>
        <select
          className="select-control"
          style={{ width: 160 }}
          value={stageFilter}
          onChange={event => setStageFilter(event.target.value)}
        >
          <option>Todos</option>
          {stageOrder.map(stage => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
        <button className="btn-secondary">
          <Filter size={13} /> Filtros
        </button>
      </div>
      <div className="inbox-layout">
        <ConversationList
          items={filtered}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
        <section className="inbox-chat">
          <div className="chat-header">
            <div className="chat-contact">
              <div className="avatar">{selected.initials}</div>
              <div>
                <strong>{selected.name}</strong>
                <small>
                  {selected.phone} · {selected.service}
                </small>
              </div>
            </div>
            <div className="chat-actions">
              <StatusBadge tone={selected.aiEnabled ? "green" : "amber"}>
                {selected.aiEnabled ? "IA ativa" : "IA pausada"}
              </StatusBadge>
              <button className="icon-button">
                <MoreHorizontal size={17} />
              </button>
            </div>
          </div>
          <div className="chat-body">
            {messages.map(message => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
          {attachment && (
            <div className="chat-attachment-preview">
              <div>
                <strong>{attachment.name}</strong>
                <small>{attachment.type} · até 8 MB</small>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Remover anexo"
                onClick={() => setAttachment(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="chat-composer">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={event => {
                selectAttachment(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <button
              className="icon-button"
              type="button"
              aria-label="Anexar arquivo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </button>
            <input
              className="input-control"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") send();
              }}
              placeholder="Escrever resposta manual..."
            />
            <button
              className="btn-primary"
              onClick={send}
              disabled={sendMutation.isPending}
              aria-label="Enviar mensagem"
            >
              <Send size={14} />
            </button>
          </div>
        </section>
        <ConversationProfile contact={selected} onToggleAi={toggleAi} />
      </div>
    </PanelLayout>
  );
}

export function KanbanPage() {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [urgency, setUrgency] = useState("Todas");
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const items = contactsQuery.data ?? [];
  const filteredItems = items.filter(contact => {
    const matchesSearch = [contact.name, contact.phone, contact.service]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    return (
      matchesSearch && (urgency === "Todas" || contact.urgency === urgency)
    );
  });
  const moveMutation = trpc.inbox.moveStage.useMutation({
    onSuccess: () => contactsQuery.refetch(),
  });
  const moveContact = (id: string, stage: string) => {
    moveMutation.mutate({ contactId: Number(id), stage });
  };
  return (
    <PanelLayout
      eyebrow="Operação / Comercial"
      title="Kanban"
      description="Acompanhe cada lead até a conclusão do serviço."
      actions={
        <PageLink href="/contacts" className="btn-primary">
          <Plus size={13} /> Novo lead
        </PageLink>
      }
    >
      <div className="filter-bar">
        <div className="search-field">
          <Search size={14} />
          <input
            className="input-control"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar no funil"
          />
        </div>
        <select
          className="select-control"
          value={urgency}
          onChange={event => setUrgency(event.target.value)}
        >
          <option>Todas</option>
          <option>Alta</option>
          <option>Média</option>
          <option>Baixa</option>
        </select>
        <span className="muted" style={{ fontSize: 10, marginLeft: "auto" }}>
          {filteredItems.length} de {items.length} leads
        </span>
      </div>
      <div className="kanban-shell">
        <div className="kanban-board">
          {stageOrder.map(stage => {
            const columnItems = filteredItems.filter(
              contact => contact.stage === stage
            );
            return (
              <div
                className="kanban-column"
                key={stage}
                onDragOver={event => event.preventDefault()}
                onDrop={() => {
                  if (draggingId) moveContact(draggingId, stage);
                  setDraggingId(null);
                }}
              >
                <div className="kanban-column-header">
                  <strong>{stage}</strong>
                  <span>{columnItems.length.toString().padStart(2, "0")}</span>
                </div>
                {columnItems.map(contact => (
                  <article
                    className="kanban-card"
                    key={contact.id}
                    draggable
                    onDragStart={() => setDraggingId(contact.id)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <div className="kanban-card-head">
                      <PageLink href={`/contacts/${contact.id}`}>
                        <div className="avatar">{contact.initials}</div>
                      </PageLink>
                      <div>
                        <strong>{contact.name}</strong>
                        <small>{contact.service}</small>
                      </div>
                    </div>
                    <div className="kanban-card-body">
                      <div className="kanban-meta">
                        <span>Urgência</span>
                        <strong
                          className={`urgency urgency-${contact.urgency.toLowerCase().replace("é", "e")}`}
                        >
                          {contact.urgency}
                        </strong>
                      </div>
                      <div className="kanban-meta">
                        <span>Local</span>
                        <strong>{contact.neighborhood}</strong>
                      </div>
                      <div className="kanban-meta">
                        <span>Orçamento</span>
                        <strong>{formatCurrency(contact.quote)}</strong>
                      </div>
                      <div className="kanban-meta">
                        <span>IA</span>
                        <strong
                          className={contact.aiEnabled ? "green" : "amber"}
                        >
                          {contact.aiEnabled ? "Ativa" : "Pausada"}
                        </strong>
                      </div>
                      <div className="kanban-meta">
                        <span>Dias sem resposta</span>
                        <strong>{contact.daysNoReply}</strong>
                      </div>
                    </div>
                    <div style={{ marginTop: 11 }}>
                      <select
                        className="select-control"
                        value={contact.stage}
                        onChange={event =>
                          moveContact(contact.id, event.target.value)
                        }
                        aria-label={`Estágio de ${contact.name}`}
                      >
                        <option value={contact.stage}>{contact.stage}</option>
                        {stageOrder
                          .filter(item => item !== contact.stage)
                          .map(item => (
                            <option key={item}>{item}</option>
                          ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </PanelLayout>
  );
}

export function AgendaPage() {
  const [view, setView] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 800 ? "dia" : "semana"
  );
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [time, setTime] = useState("17:30");
  const [contactId, setContactId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [notes, setNotes] = useState("");
  const agendaQuery = trpc.agenda.snapshot.useQuery();
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const createMutation = trpc.agenda.create.useMutation({
    onSuccess: async () => {
      setShowForm(false);
      setNotes("");
      await agendaQuery.refetch();
    },
  });
  const statusMutation = trpc.agenda.updateStatus.useMutation({
    onSuccess: () => agendaQuery.refetch(),
  });
  const cancelMutation = trpc.agenda.cancel.useMutation({
    onSuccess: () => agendaQuery.refetch(),
  });
  const days = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const serviceOptions = agendaQuery.data?.services ?? [];
  const professionalOptions = agendaQuery.data?.professionals ?? [];
  const workspaceTimezone = agendaQuery.data?.timezone ?? "America/Sao_Paulo";
  const statusLabel = (status: string) =>
    status === "confirmed"
      ? "Confirmado"
      : status === "requested"
        ? "Solicitado"
        : status === "in_progress"
          ? "Em andamento"
          : status === "completed"
            ? "Concluído"
            : status === "cancelled"
              ? "Cancelado"
              : "Não compareceu";
  const remoteAppointments = (agendaQuery.data?.appointments ?? []).map(
    item => {
      const startsAt = new Date(item.startsAt);
      const endsAt = new Date(item.endsAt);
      return {
        id: String(item.id),
        contactName: item.contactName ?? "Cliente sem nome",
        professionalName: item.professionalName ?? "Profissional",
        service: item.serviceName ?? "Atendimento",
        date: startsAt.toLocaleDateString("pt-BR", {
          timeZone: workspaceTimezone,
        }),
        time: startsAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: workspaceTimezone,
        }),
        duration: `${Math.max(15, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000))} min`,
        status: statusLabel(item.status),
        rawStatus: item.status,
        notes: item.notes ?? "",
      };
    }
  );
  const agendaItems = remoteAppointments;
  const selectedDay = new Date(`${date}T12:00:00`);
  const dayLabel = selectedDay.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: workspaceTimezone,
  });
  const shiftDate = (amount: number) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + amount);
    setDate(next.toISOString().slice(0, 10));
  };
  const submitAppointment = () => {
    const selectedService = serviceOptions.find(
      item => String(item.id) === serviceId
    );
    const duration = selectedService?.durationMinutes ?? 60;
    const startsAt = new Date(`${date}T${time}:00`);
    const endsAt = new Date(startsAt.getTime() + duration * 60000);
    createMutation.mutate({
      contactId: contactId ? Number(contactId) : undefined,
      serviceId: Number(serviceId || serviceOptions[0]?.id),
      professionalId: Number(professionalId || professionalOptions[0]?.id),
      startsAt,
      endsAt,
      notes: notes || undefined,
    });
  };
  return (
    <PanelLayout
      eyebrow="Operação / Agenda"
      title="Agenda"
      description="Veja seus próximos atendimentos e disponibilidade."
      actions={
        <button
          className="btn-primary"
          onClick={() => setShowForm(value => !value)}
        >
          <Plus size={13} /> Novo agendamento
        </button>
      }
    >
      {showForm && (
        <section className="surface appointment-form-panel">
          <SectionTitle eyebrow="Novo atendimento" title="Reservar horário" />
          <div className="form-grid">
            <div className="form-field">
              <label>Cliente</label>
              <select
                className="select-control"
                value={contactId}
                onChange={event => setContactId(event.target.value)}
              >
                <option value="">Cliente sem cadastro</option>
                {(contactsQuery.data ?? contacts).map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Serviço</label>
              <select
                className="select-control"
                value={serviceId || String(serviceOptions[0]?.id ?? "")}
                onChange={event => setServiceId(event.target.value)}
              >
                {serviceOptions.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.durationMinutes} min
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Profissional</label>
              <select
                className="select-control"
                value={
                  professionalId || String(professionalOptions[0]?.id ?? "")
                }
                onChange={event => setProfessionalId(event.target.value)}
              >
                {professionalOptions.map(professional => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Data</label>
              <input
                className="input-control"
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Horário</label>
              <input
                className="input-control"
                type="time"
                value={time}
                onChange={event => setTime(event.target.value)}
              />
            </div>
            <div className="form-field full">
              <label>Observações</label>
              <input
                className="input-control"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Ex.: confirmar pelo WhatsApp"
              />
            </div>
          </div>
          {createMutation.error && (
            <div
              className="demo-banner"
              style={{ marginTop: 15, marginBottom: 0 }}
            >
              <Info size={14} /> {createMutation.error.message}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="btn-primary"
              disabled={
                createMutation.isPending ||
                !serviceOptions.length ||
                !professionalOptions.length
              }
              onClick={submitAppointment}
            >
              {createMutation.isPending ? "Salvando..." : "Reservar horário"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <div className="agenda-layout">
        <section className="surface calendar-panel">
          <div className="calendar-toolbar">
            <div>
              <span className="eyebrow">
                {selectedDay.toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <strong>{dayLabel}</strong>
            </div>
            <div className="calendar-actions">
              <button className="btn-secondary" onClick={() => shiftDate(-1)}>
                Anterior
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const now = new Date();
                  setDate(
                    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
                  );
                }}
              >
                Hoje
              </button>
              <button className="btn-secondary" onClick={() => shiftDate(1)}>
                Próximo
              </button>
              <ViewToggle active={view} onChange={setView} />
            </div>
          </div>
          {view === "dia" ? (
            <div style={{ paddingTop: 18 }}>
              <SectionTitle eyebrow={dayLabel} title="Agenda do dia" />
              {agendaItems.filter(
                appointment =>
                  appointment.date ===
                  selectedDay.toLocaleDateString("pt-BR", {
                    timeZone: workspaceTimezone,
                  })
              ).length > 0 ? (
                <div className="list-stack">
                  {agendaItems
                    .filter(
                      appointment =>
                        appointment.date ===
                        selectedDay.toLocaleDateString("pt-BR", {
                          timeZone: workspaceTimezone,
                        })
                    )
                    .map(appointment => (
                      <div className="appointment-row" key={appointment.id}>
                        <div className="time-block">{appointment.time}</div>
                        <div className="row-copy">
                          <strong>{appointment.contactName}</strong>
                          <small>
                            {appointment.service} · {appointment.duration}
                          </small>
                          <small>{appointment.notes}</small>
                          <div className="row-actions">
                            <StatusBadge
                              tone={
                                appointment.status === "Confirmado"
                                  ? "green"
                                  : appointment.status === "Cancelado"
                                    ? "red"
                                    : "amber"
                              }
                            >
                              {appointment.status}
                            </StatusBadge>
                            {appointment.status === "Solicitado" && (
                              <button
                                className="btn-secondary"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: Number(appointment.id),
                                    status: "confirmed",
                                  })
                                }
                              >
                                Confirmar
                              </button>
                            )}
                            {appointment.status === "Confirmado" && (
                              <button
                                className="btn-secondary"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: Number(appointment.id),
                                    status: "completed",
                                  })
                                }
                              >
                                Concluir
                              </button>
                            )}
                            {appointment.status !== "Cancelado" &&
                              appointment.status !== "Concluído" && (
                                <button
                                  className="btn-secondary"
                                  onClick={() =>
                                    cancelMutation.mutate({
                                      id: Number(appointment.id),
                                    })
                                  }
                                >
                                  Cancelar
                                </button>
                              )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarCheck2}
                  title="Nenhum horário neste dia"
                  description="Crie um agendamento ou escolha outra data."
                />
              )}
            </div>
          ) : (
            <div className="list-stack" style={{ paddingTop: 18 }}>
              {agendaItems.length ? (
                agendaItems.map(appointment => (
                  <div className="appointment-row" key={appointment.id}>
                    <div className="time-block">
                      {appointment.date}
                      <small style={{ display: "block", marginTop: 4 }}>
                        {appointment.time}
                      </small>
                    </div>
                    <div className="row-copy">
                      <strong>{appointment.contactName}</strong>
                      <small>
                        {appointment.service} · {appointment.duration}
                      </small>
                      <small>{appointment.notes || "Sem observações"}</small>
                      <StatusBadge
                        tone={
                          appointment.status === "Confirmado"
                            ? "green"
                            : appointment.status === "Cancelado"
                              ? "red"
                              : "amber"
                        }
                      >
                        {appointment.status}
                      </StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={CalendarCheck2}
                  title="Nenhum agendamento"
                  description="Crie o primeiro atendimento para começar a agenda."
                />
              )}
            </div>
          )}
        </section>
        <aside className="surface side-list">
          <h3>Próximos agendamentos</h3>
          {agendaItems.slice(0, 8).map(appointment => (
            <div className="appointment-row" key={appointment.id}>
              <div className="time-block">
                {appointment.date.slice(0, 5)}
                <small
                  style={{ display: "block", marginTop: 4, color: "#555" }}
                >
                  {appointment.time}
                </small>
              </div>
              <div className="row-copy">
                <strong>{appointment.contactName}</strong>
                <small>
                  {appointment.service} · {appointment.status}
                </small>
              </div>
            </div>
          ))}
          <button
            className="btn-secondary"
            style={{ width: "100%", marginTop: 14 }}
            onClick={() => setView("dia")}
          >
            Ver agenda do dia
          </button>
        </aside>
      </div>
    </PanelLayout>
  );
}

export function ContactsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const utils = trpc.useUtils();
  const createMutation = trpc.inbox.createContact.useMutation({
    onSuccess: async contact => {
      await utils.inbox.contacts.invalidate();
      setShowForm(false);
      setName("");
      setPhone("");
      setService("");
      setCity("");
      setNeighborhood("");
      if (contact) navigate("/contacts/" + contact.id);
    },
  });
  const items = contactsQuery.data ?? [];
  const filtered = items.filter(contact =>
    [contact.name, contact.phone, contact.service]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const submit = () =>
    createMutation.mutate({
      name,
      phone,
      serviceRequested: service || undefined,
      city: city || undefined,
      neighborhood: neighborhood || undefined,
    });
  return (
    <PanelLayout
      eyebrow="Clientes / CRM local"
      title="Contatos"
      description="Clientes e leads sincronizados com o atendimento."
      actions={
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={13} /> Novo contato
        </button>
      }
    >
      <DemoBanner />
      {showForm && (
        <section className="surface contact-form-panel">
          <SectionTitle eyebrow="Novo cadastro" title="Adicionar contato" />
          <div className="form-grid">
            <div className="form-field">
              <label>Nome completo</label>
              <input
                className="input-control"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ex.: Ana Souza"
              />
            </div>
            <div className="form-field">
              <label>WhatsApp</label>
              <input
                className="input-control"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="5511999999999"
              />
            </div>
            <div className="form-field">
              <label>Serviço de interesse</label>
              <input
                className="input-control"
                value={service}
                onChange={event => setService(event.target.value)}
                placeholder="Ex.: Corte e escova"
              />
            </div>
            <div className="form-field">
              <label>Cidade</label>
              <input
                className="input-control"
                value={city}
                onChange={event => setCity(event.target.value)}
                placeholder="São Paulo"
              />
            </div>
            <div className="form-field">
              <label>Bairro</label>
              <input
                className="input-control"
                value={neighborhood}
                onChange={event => setNeighborhood(event.target.value)}
                placeholder="Centro"
              />
            </div>
          </div>
          {createMutation.error && (
            <div className="form-error">{createMutation.error.message}</div>
          )}
          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={
                createMutation.isPending ||
                name.trim().length < 2 ||
                phone.trim().length < 8
              }
              onClick={submit}
            >
              {createMutation.isPending ? "Salvando..." : "Salvar contato"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <div className="filter-bar">
        <div className="search-field">
          <Search size={14} />
          <input
            className="input-control"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar contato, telefone ou serviço"
          />
        </div>
        <button className="btn-secondary">
          <Filter size={13} /> Filtros
        </button>
      </div>
      <div className="surface data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Contato</th>
              <th>Serviço</th>
              <th>Estágio</th>
              <th>Urgência</th>
              <th>IA</th>
              <th>Atualização</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(contact => (
              <tr
                key={contact.id}
                onClick={() => navigate("/contacts/" + contact.id)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <div className="table-person">
                    <div className="avatar">{contact.initials}</div>
                    <div>
                      {contact.name}
                      <span className="table-secondary">{contact.phone}</span>
                    </div>
                  </div>
                </td>
                <td>
                  {contact.service}
                  <span className="table-secondary">
                    {contact.neighborhood}, {contact.city}
                  </span>
                </td>
                <td>
                  <StatusBadge
                    tone={
                      contact.stage === "Agendado"
                        ? "green"
                        : contact.stage === "Sem retorno"
                          ? "amber"
                          : "blue"
                    }
                  >
                    {contact.stage}
                  </StatusBadge>
                </td>
                <td>
                  <span
                    className={
                      "urgency urgency-" +
                      contact.urgency.toLowerCase().replace("é", "e")
                    }
                  >
                    {contact.urgency}
                  </span>
                </td>
                <td className={contact.aiEnabled ? "green" : "amber"}>
                  {contact.aiEnabled ? "Ativa" : "Pausada"}
                </td>
                <td>{formatChatTime(contact.lastMessageAt)}</td>
                <td>
                  <button className="icon-button">
                    <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelLayout>
  );
}

export function ContactDetailPage() {
  const [, params] = useRoute("/contacts/:id");
  const detailId = Number(params?.id ?? 0);
  const detailInput = useMemo(() => ({ contactId: detailId }), [detailId]);
  const threadQuery = trpc.inbox.thread.useQuery(detailInput, {
    enabled: detailId > 0,
  });
  const contact = threadQuery.data?.contact;
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const messages = threadQuery.data?.messages ?? [];
  const audit = threadQuery.data?.audit ?? [];
  const notes = threadQuery.data?.notes ?? [];
  const agendaQuery = trpc.agenda.snapshot.useQuery();
  const utils = trpc.useUtils();
  const addNoteMutation = trpc.inbox.addNote.useMutation({
    onSuccess: async () => {
      setNote("");
      await utils.inbox.thread.invalidate(detailInput);
    },
  });
  const contactAppointments =
    agendaQuery.data?.appointments.filter(
      appointment => appointment.contactId === detailId
    ) ?? [];
  if (!contact)
    return (
      <PanelLayout
        eyebrow="Clientes / Ficha"
        title="Ficha do cliente"
        description="Histórico operacional, conversa e dados sincronizados."
        actions={
          <PageLink href="/contacts" className="btn-secondary">
            <ArrowDownRight size={13} /> Voltar para contatos
          </PageLink>
        }
      >
        {threadQuery.isLoading ? (
          <EmptyState
            icon={UserRound}
            title="Carregando contato"
            description="Buscando os dados persistidos."
          />
        ) : (
          <EmptyState
            icon={UserRound}
            title="Contato não encontrado"
            description="Este contato ainda não existe neste workspace."
          />
        )}
      </PanelLayout>
    );
  return (
    <PanelLayout
      eyebrow="Clientes / Ficha"
      title="Ficha do cliente"
      description="Histórico operacional, conversa e dados sincronizados."
      actions={
        <PageLink href="/contacts" className="btn-secondary">
          <ArrowDownRight size={13} /> Voltar para contatos
        </PageLink>
      }
    >
      <DemoBanner />
      <div className="detail-layout">
        <aside className="surface detail-nav">
          {[
            ["overview", "Visão geral"],
            ["conversation", "Conversa"],
            ["appointments", "Agendamentos"],
            ["notes", "Notas internas"],
            ["history", "Histórico de eventos"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </aside>
        <section className="surface detail-card">
          <div className="detail-hero">
            <div className="detail-person">
              <div className="avatar">{contact.initials}</div>
              <div>
                <h2>{contact.name}</h2>
                <p>
                  {contact.phone} · {contact.city}, {contact.neighborhood}
                </p>
              </div>
            </div>
            <div className="detail-actions">
              <a className="btn-secondary" href={`tel:${contact.phone}`}>
                <Phone size={13} /> Ligar
              </a>
              <PageLink
                href={`/inbox?contactId=${contact.id}`}
                className="btn-primary"
              >
                <MessageCircle size={13} /> Abrir conversa
              </PageLink>
            </div>
          </div>
          <div className="detail-stats">
            <div className="detail-stat">
              <span>Serviço solicitado</span>
              <strong>{contact.service}</strong>
            </div>
            <div className="detail-stat">
              <span>Estágio atual</span>
              <strong>{contact.stage}</strong>
            </div>
            <div className="detail-stat">
              <span>Orçamento</span>
              <strong>{formatCurrency(contact.quote)}</strong>
            </div>
            <div className="detail-stat">
              <span>IA</span>
              <strong className={contact.aiEnabled ? "green" : "amber"}>
                {contact.aiEnabled ? "Ativa" : "Pausada"}
              </strong>
            </div>
          </div>
          {tab === "overview" && (
            <>
              <SectionTitle eyebrow="Resumo" title="Dados do atendimento" />
              <div className="timeline">
                <div className="timeline-row">
                  <div className="timeline-time">
                    {formatChatTime(contact.lastMessageAt)}
                  </div>
                  <div className="timeline-marker" />
                  <div className="timeline-copy">
                    <strong>Última mensagem registrada</strong>
                    <p>{contact.lastMessage}</p>
                  </div>
                </div>
                <div className="timeline-row">
                  <div className="timeline-time">Hoje</div>
                  <div className="timeline-marker" />
                  <div className="timeline-copy">
                    <strong>Contato sincronizado</strong>
                    <p>Dados carregados da base persistente do Forte Panel.</p>
                  </div>
                </div>
              </div>
            </>
          )}
          {tab === "conversation" && (
            <div className="chat-body" style={{ padding: "4px 0" }}>
              {messages.length ? (
                messages.map(message => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <EmptyState
                  icon={MessageCircle}
                  title="Nenhuma mensagem ainda"
                  description="As mensagens deste contato aparecerão aqui."
                />
              )}
            </div>
          )}
          {tab === "appointments" && (
            <div className="list-stack">
              {contactAppointments.length > 0 ? (
                contactAppointments.map(appointment => {
                  const startsAt = new Date(appointment.startsAt);
                  const timezone =
                    agendaQuery.data?.timezone ?? "America/Sao_Paulo";
                  return (
                    <div className="appointment-row" key={appointment.id}>
                      <div className="time-block">
                        {startsAt.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: timezone,
                        })}
                      </div>
                      <div className="row-copy">
                        <strong>
                          {appointment.serviceName ?? "Atendimento"}
                        </strong>
                        <small>
                          {startsAt.toLocaleDateString("pt-BR", {
                            timeZone: timezone,
                          })}{" "}
                          · {appointment.professionalName ?? "Profissional"}
                        </small>
                        <small>{appointment.notes ?? "Sem observações"}</small>
                      </div>
                      <StatusBadge
                        tone={
                          appointment.status === "confirmed"
                            ? "green"
                            : appointment.status === "cancelled"
                              ? "red"
                              : "amber"
                        }
                      >
                        {appointment.status === "confirmed"
                          ? "Confirmado"
                          : appointment.status === "requested"
                            ? "Solicitado"
                            : appointment.status}
                      </StatusBadge>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={CalendarCheck2}
                  title="Nenhum agendamento para este contato"
                  description="Reserve um horário pela Agenda para acompanhar o atendimento aqui."
                />
              )}
            </div>
          )}
          {tab === "notes" && (
            <div>
              <textarea
                className="textarea-control"
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Escreva uma nota interna para este contato..."
              />
              {notes.length > 0 && (
                <div className="list-stack" style={{ marginTop: 14 }}>
                  {notes.map(item => (
                    <div className="timeline-copy" key={item.id}>
                      <strong>Nota interna</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </small>
                      <p>{item.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {addNoteMutation.error && (
                <div className="form-error">
                  {addNoteMutation.error.message}
                </div>
              )}
              <button
                className="btn-primary"
                disabled={addNoteMutation.isPending || note.trim().length < 2}
                style={{ marginTop: 10 }}
                onClick={() =>
                  addNoteMutation.mutate({ contactId: detailId, content: note })
                }
              >
                {addNoteMutation.isPending ? "Salvando..." : "Salvar nota"}
              </button>
            </div>
          )}
          {tab === "history" && (
            <div className="timeline">
              {audit.length > 0 ? (
                audit.map(item => (
                  <div className="timeline-row" key={item.id}>
                    <div className="timeline-time">
                      {formatChatTime(item.createdAt.toISOString())}
                    </div>
                    <div className="timeline-marker" />
                    <div className="timeline-copy">
                      <strong>{item.action}</strong>
                      <p>{item.summary}</p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Clock3}
                  title="Ainda sem eventos de auditoria"
                  description="As próximas ações do operador aparecerão aqui."
                />
              )}
            </div>
          )}
        </section>
      </div>
    </PanelLayout>
  );
}

export function BillingPage() {
  const [showForm, setShowForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localQuotes, setLocalQuotes] = useState(quotes);
  const totalQuoted = localQuotes.reduce((sum, quote) => sum + quote.quoted, 0);
  const totalReceived = localQuotes.reduce(
    (sum, quote) => sum + quote.received,
    0
  );
  return (
    <PanelLayout
      eyebrow="Financeiro / Controle manual"
      title="Faturamento"
      description="Orçamentos e recebimentos, sem gateway de pagamento."
      actions={
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(true);
            setSaved(false);
          }}
        >
          <Plus size={13} /> Novo orçamento
        </button>
      }
    >
      <DemoBanner />
      <div className="billing-summary">
        <div className="surface billing-card">
          <span>Total orçado</span>
          <strong>{formatCurrency(totalQuoted)}</strong>
        </div>
        <div className="surface billing-card">
          <span>Total aprovado</span>
          <strong className="blue">{formatCurrency(950)}</strong>
        </div>
        <div className="surface billing-card">
          <span>Recebido</span>
          <strong className="green">{formatCurrency(totalReceived)}</strong>
        </div>
        <div className="surface billing-card">
          <span>Pendente</span>
          <strong className="amber">
            {formatCurrency(totalQuoted - totalReceived)}
          </strong>
        </div>
        <div className="surface billing-card">
          <span>Em aberto</span>
          <strong>
            {localQuotes
              .filter(quote => quote.status !== "Pago")
              .length.toString()
              .padStart(2, "0")}
          </strong>
        </div>
      </div>
      <div className="billing-layout">
        <section className="surface form-panel">
          <SectionTitle
            eyebrow="Registros recentes"
            title="Orçamentos"
            action={
              <select className="select-control" style={{ width: 145 }}>
                <option>Setembro 2026</option>
                <option>Agosto 2026</option>
              </select>
            }
          />
          {localQuotes.map(quote => {
            const contact = getContact(quote.contactId);
            return (
              <div className="quote-row" key={quote.id}>
                <div className="avatar">{contact.initials}</div>
                <div className="row-copy">
                  <strong>{contact.name}</strong>
                  <small>
                    {quote.service} · {quote.description}
                  </small>
                  <div style={{ marginTop: 7 }}>
                    <StatusBadge
                      tone={
                        quote.status === "Pago"
                          ? "green"
                          : quote.status === "Aprovado"
                            ? "blue"
                            : "amber"
                      }
                    >
                      {quote.status}
                    </StatusBadge>
                  </div>
                </div>
                <div className="quote-amount">
                  <strong>{formatCurrency(quote.quoted)}</strong>
                  <small>
                    Pendente {formatCurrency(quote.quoted - quote.received)}
                  </small>
                </div>
              </div>
            );
          })}
        </section>
        {showForm ? (
          <section className="surface form-panel">
            <SectionTitle eyebrow="Novo registro" title="Criar orçamento" />
            <div className="form-grid">
              <div className="form-field full">
                <label>Cliente</label>
                <select className="select-control">
                  <option>Selecione um contato</option>
                  {contacts.map(contact => (
                    <option key={contact.id}>{contact.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Serviço</label>
                <input
                  className="input-control"
                  placeholder="Ex.: Instalação"
                />
              </div>
              <div className="form-field">
                <label>Valor do orçamento</label>
                <input className="input-control" placeholder="R$ 0,00" />
              </div>
              <div className="form-field full">
                <label>Descrição</label>
                <textarea
                  className="textarea-control"
                  placeholder="Descreva o serviço e as condições..."
                />
              </div>
              <div className="form-field">
                <label>Vencimento</label>
                <input type="date" className="input-control" />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select className="select-control">
                  <option>Orçamento</option>
                  <option>Aguardando aprovação</option>
                  <option>Aprovado</option>
                </select>
              </div>
            </div>
            {saved && (
              <div
                className="demo-banner"
                style={{ marginTop: 15, marginBottom: 0 }}
              >
                <CheckCircle2 size={14} /> Orçamento salvo localmente em modo
                demo.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                className="btn-primary"
                onClick={() => {
                  setSaved(true);
                  setShowForm(false);
                }}
              >
                Salvar orçamento
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
            </div>
          </section>
        ) : (
          <section className="surface form-panel">
            <EmptyState
              icon={WalletCards}
              title="Controle financeiro manual"
              description="Registre orçamento, recebimento e pendência sem processar pagamentos reais."
            />
            <button
              className="btn-secondary"
              style={{ width: "100%", marginTop: 13 }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={13} /> Adicionar registro
            </button>
          </section>
        )}
      </div>
    </PanelLayout>
  );
}

export function IntegrationsPage() {
  const channelsQuery = trpc.workspace.channels.useQuery();
  const usageQuery = trpc.workspace.usage.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const channels = channelsQuery.data ?? [];
  const usage = usageQuery.data;
  const baileys = channels.find(channel => channel.provider === "baileys");
  const usageMetrics = usage
    ? (
        [
          ["apiRequests", "API"],
          ["aiRequests", "Execuções de IA"],
          ["outboundMessages", "Mensagens outbound"],
        ] as const
      ).map(([key, label]) => ({ key, label, ...usage.workspace[key] }))
    : [];
  const usagePercent = (used: number, limit: number) =>
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <PanelLayout
      eyebrow="Conexão WhatsApp"
      title="Conecte seu WhatsApp"
      description="Gerencie uma única instância WhatsApp por workspace, com QR Code e sessão persistente."
    >
      <DemoBanner />
      <BaileysConnectionCard />
      <section className="surface" style={{ marginTop: 20, padding: 20 }}>
        <SectionTitle
          eyebrow="Consumo do workspace"
          title={usage ? `Plano ${usage.plan}` : "Cotas e consumo"}
          action={
            <StatusBadge tone={usageQuery.isError ? "red" : "green"}>
              {usageQuery.isFetching ? "Atualizando" : "Ao vivo"}
            </StatusBadge>
          }
        />
        {usageQuery.isLoading ? (
          <div className="muted">Carregando consumo atual...</div>
        ) : usageQuery.error ? (
          <div className="form-error">{usageQuery.error.message}</div>
        ) : usage ? (
          <>
            <p className="muted">
              Janela atual até{" "}
              {new Date(usage.resetsAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              .
            </p>
            <div className="stat-grid" style={{ marginTop: 16 }}>
              {usageMetrics.map(metric => {
                const percent = usagePercent(metric.used, metric.limit);
                return (
                  <div
                    className="surface surface-hover stat-card"
                    key={metric.key}
                  >
                    <div className="stat-top">
                      <span className="stat-label">{metric.label}</span>
                      <Gauge
                        size={16}
                        className={percent >= 80 ? "amber" : "green"}
                      />
                    </div>
                    <strong className="stat-value">
                      {metric.used}{" "}
                      <small style={{ fontSize: 12, fontWeight: 500 }}>
                        / {metric.limit}
                      </small>
                    </strong>
                    <span className="stat-foot">
                      {Math.max(0, metric.limit - metric.used)} restantes ·{" "}
                      {percent}% usado
                    </span>
                    <div
                      style={{
                        height: 5,
                        background: "rgba(0,0,0,.08)",
                        borderRadius: 99,
                        marginTop: 10,
                      }}
                    >
                      <div
                        style={{
                          width: `${percent}%`,
                          height: "100%",
                          background: percent >= 80 ? "#d28a24" : "#2d8a61",
                          borderRadius: 99,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </section>
      <section className="surface" style={{ marginTop: 20, padding: 20 }}>
        <SectionTitle eyebrow="Proteções ativas" title="Canais protegidos" />
        <div className="profile-field">
          <span>
            <ShieldCheck
              size={14}
              style={{ verticalAlign: "middle", marginRight: 8 }}
            />
            Baileys nativo
          </span>
          <strong className={baileys?.configured ? "green" : "amber"}>
            {baileys?.configured ? "Protegido" : "Pendente"}
          </strong>
        </div>
        <div className="profile-field">
          <span>
            <ShieldCheck
              size={14}
              style={{ verticalAlign: "middle", marginRight: 8 }}
            />
            Agente nativo
          </span>
          <strong className="green">Protegido</strong>
        </div>
      </section>
    </PanelLayout>
  );
}

export function NotFoundPage() {
  return (
    <PanelLayout
      eyebrow="Sistema"
      title="Página não encontrada"
      description="A rota informada ainda não existe neste MVP."
    >
      <EmptyState
        icon={Search}
        title="Nada por aqui"
        description="Use a navegação lateral para voltar à operação."
      />
      <div style={{ marginTop: 15, textAlign: "center" }}>
        <PageLink href="/dashboard" className="btn-primary">
          Voltar ao dashboard
        </PageLink>
      </div>
    </PanelLayout>
  );
}
