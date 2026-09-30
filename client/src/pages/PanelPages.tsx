import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarCheck2,
  Check,
  ClipboardList,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Filter,
  Headphones,
  Info,
  KanbanSquare,
  MapPin,
  Mic,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
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
import { PlatformShell } from "./PlatformAdminPage";
import { trpc } from "@/lib/trpc";
import { getNextActionState } from "@shared/inbox-next-action";
import {
  WhatsappConnectionPage,
  WorkspaceUsagePage,
} from "./WhatsappConnectionPage";
export { WhatsappConnectionPage, WorkspaceUsagePage };

const stageOrder = [
  "Novo contato",
  "Triagem",
  "Aguardando foto",
  "Avaliação pendente",
  "Orçamento enviado",
  "Aguardando decisão",
  "Visita solicitada",
  "Agendado",
  "Concluído",
  "Sem retorno",
  "Perdido",
] as const;
const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function toLocalDateTimeInput(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatNextActionDue(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Prazo inválido";
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
            ? `Baileys nativo${channel?.phoneNumber ? ` · ${channel.phoneNumber}` : ""}. Mídia básica e mensagens passam pelo worker.`
            : "Configure e ative um canal em Integrações antes de esperar envio ou recebimento real."}
        </span>
      </div>
    </div>
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

type ContactLike = {
  id: string;
  name: string;
  phone: string;
  city: string;
  neighborhood: string;
  service: string;
  urgency: string;
  stage: string;
  aiEnabled: boolean;
  unread: number;
  lastMessage: string;
  lastMessageAt: string;
  quote: number;
  daysNoReply: number;
  initials: string;
  isGroup?: boolean;
  groupJid?: string | null;
  groupSubject?: string | null;
  groupInstanceId?: string | null;
  groupParticipantCount?: number;
  groupParticipants?: Array<{
    jid: string;
    jidAlt: string | null;
    name: string | null;
    isAdmin: number;
  }>;
  pushName?: string | null;
  nameSource?: string;
  opportunityId?: string | null;
  assignedMemberId?: string | null;
  assignedMemberName?: string | null;
  nextAction?: { id: string; title: string; dueAt: string } | null;
};
type Message = {
  id: string | number;
  sender: string;
  time: string;
  text: string;
  messageType?: string;
  metadata?: Record<string, unknown> | null;
  status?: string;
};

function formatChatTime(value: string) {
  if (value === "agora" || value === "ontem") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  const dashboardQuery = trpc.dashboard.snapshot.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const onboardingSessionQuery = trpc.onboarding.session.useQuery(undefined, {
    enabled: Boolean(
      accessQuery.data?.canManageTeam || accessQuery.data?.platform
    ),
    retry: false,
  });
  const snapshot = dashboardQuery.data;
  const onboardingSession = onboardingSessionQuery.data;
  const onboardingStepLabels: Record<string, string> = {
    identity: "Identidade da empresa",
    offering: "Oferta e serviços",
    operations: "Área e horários",
    guardrails: "Limites do atendimento",
    voice: "Tom e respostas aprovadas",
    publication: "Revisão e publicação",
    review: "Revisão final",
  };
  const money = (cents: number) => formatCurrency(cents / 100);
  return (
    <PanelLayout
      eyebrow="Operação / Overview"
      title="Dashboard"
      description="Veja o que precisa de atenção hoje, a receita realizada e a saúde do canal."
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
      <section className="surface" style={{ padding: 18, marginTop: 20 }}>
        <SectionTitle eyebrow="Prioridade operacional" title="Decisões do dia" />
        <div className="dashboard-decision-grid">
          {(snapshot?.decisions ?? []).map(decision => (
            <PageLink href={decision.href} className="dashboard-decision" key={decision.key}>
              <div>
                <strong>{decision.label}</strong>
                <small>{decision.count === 0 ? "Nenhuma pendência" : `${decision.count} pendência(s)`}</small>
              </div>
              <StatusBadge tone={decision.count === 0 ? "green" : decision.tone as "amber" | "red" | "blue" | "green"}>{String(decision.count).padStart(2, "0")}</StatusBadge>
            </PageLink>
          ))}
          <div className="dashboard-decision">
            <div>
              <strong>Saúde do canal</strong>
              <small>{snapshot?.channelHealth?.activeChannels ?? 0} canal(is) ativo(s) · worker {snapshot?.channelHealth?.worker ?? "unknown"}</small>
            </div>
            <StatusBadge tone={snapshot?.channelHealth?.status === "ready" ? "green" : "amber"}>
              {snapshot?.channelHealth?.status === "ready" ? "Operando" : snapshot?.channelHealth?.status === "attention" ? "Atenção" : "Configurar"}
            </StatusBadge>
          </div>
        </div>
      </section>
      {onboardingSession && onboardingSession.status !== "completed" && (
        <section
          className="surface"
          style={{
            padding: 20,
            marginTop: 20,
            borderColor: "rgba(86,214,138,.22)",
            background:
              "linear-gradient(135deg, rgba(86,214,138,.055), rgba(255,255,255,.014))",
          }}
        >
          <SectionTitle
            eyebrow="Configuração da empresa"
            title="Retome de onde parou"
            action={
              <StatusBadge
                tone={onboardingSession.status === "paused" ? "amber" : "green"}
              >
                {onboardingSession.status === "paused"
                  ? "Pausado"
                  : "Em andamento"}
              </StatusBadge>
            }
          />
          <p className="muted" style={{ margin: "-4px 0 15px", fontSize: 11 }}>
            Próximo passo:{" "}
            <strong style={{ color: "#b9e4c7" }}>
              {onboardingStepLabels[onboardingSession.currentStep] ??
                onboardingSession.currentStep}
            </strong>
            . O rascunho salvo será carregado automaticamente.
          </p>
          <PageLink href="/onboarding" className="btn-primary">
            Retomar configuração <ArrowUpRight size={13} />
          </PageLink>
        </section>
      )}
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
              {contact.isGroup && (
                <StatusBadge tone="blue">Grupo</StatusBadge>
              )}
              {contact.unread > 0 && (
                <span className="unread-pill">{contact.unread}</span>
              )}
            </div>
            <div className="conversation-preview">{contact.lastMessage}</div>
            {!contact.isGroup && (() => {
              const actionState = getNextActionState(contact.nextAction?.dueAt);
              return (
                <div className="conversation-operational-state">
                  <span className="conversation-assignee">
                    {contact.assignedMemberName || "Sem responsável"}
                  </span>
                  <span className={`next-action-chip is-${actionState}`}>
                    {actionState === "none"
                      ? "Sem próxima ação"
                      : actionState === "overdue"
                        ? "Ação atrasada"
                        : `Até ${formatNextActionDue(contact.nextAction!.dueAt)}`}
                  </span>
                </div>
              );
            })()}
            <div className="conversation-bottom">
              <span>{formatChatTime(contact.lastMessageAt)}</span>
              <span
                className={`ai-indicator ${contact.aiEnabled ? "" : "paused"}`}
              >
                {contact.isGroup
                  ? "WhatsApp · manual"
                  : contact.aiEnabled
                    ? "IA ativa"
                    : "IA pausada"}
              </span>
            </div>
          </div>
        </button>
      ))}
      {items.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="Nenhuma conversa neste filtro"
          description="Tente outra busca, etapa ou seleção de instâncias."
        />
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? message.metadata
      : {};
  const groupAuthor =
    typeof metadata.authorName === "string" ? metadata.authorName.trim() : "";
  const groupAuthorJid =
    typeof metadata.authorJid === "string" ? metadata.authorJid.trim() : "";
  const groupAuthorId = groupAuthorJid
    ? groupAuthorJid.split("@")[0]
    : "";
  const author =
    groupAuthor || groupAuthorId || (message.sender === "lead"
        ? "Lead"
      : message.sender === "ai"
        ? "IA automática"
        : message.sender === "human"
          ? "Atendente"
        : "Sistema");
  const time = message.time.includes("T")
    ? new Date(message.time).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    })
    : message.time;
  const deliveryStatus =
    message.sender !== "lead" && message.sender !== "system"
      ? metadata.deliveryStatus
      : undefined;
  const deliveryLabel = deliveryStatus === "read"
    ? "Lida"
    : deliveryStatus === "delivered"
      ? "Entregue"
      : deliveryStatus === "sent"
        ? "Enviada"
        : undefined;
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
      const url = new URL(mediaUrlValue, window.location.origin);
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
    "carousel",
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
        <div className="message-author" title={groupAuthorJid || undefined}>
          {author}
        </div>
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
        {typeof metadata.sentViaInstanceName === "string" && (
          <div className="message-instance-label">
            Enviado por {metadata.sentViaInstanceName}
          </div>
        )}
        <div className="message-time">
          {time}{" "}
          {message.sender !== "system" && (
            <>
              <Check
                size={10}
                style={{ display: "inline", verticalAlign: "middle" }}
              />
              {deliveryLabel && <span className="message-delivery-status" aria-label={`Status da mensagem: ${deliveryLabel}`}> · {deliveryLabel}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationProfile({
  contact,
  isOpen,
  onClose,
  onRenamed,
  platformAdmin = false,
}: {
  contact: ContactLike;
  isOpen: boolean;
  onClose: () => void;
  onRenamed: () => void;
  platformAdmin?: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(contact.name);
  const inbox = (platformAdmin ? trpc.platform.supportInbox : trpc.inbox) as typeof trpc.inbox;
  const renameMutation = inbox.renameContact.useMutation({
    onSuccess: () => {
      setEditingName(false);
      onRenamed();
    },
  });
  const assignmentOptionsQuery = trpc.inbox.assignmentOptions.useQuery(
    undefined,
    { enabled: isOpen && !platformAdmin }
  );
  const assignMutation = trpc.inbox.assignOpportunity.useMutation({
    onSuccess: onRenamed,
  });
  const nextActionMutation = trpc.inbox.setNextAction.useMutation({
    onSuccess: onRenamed,
  });
  const completeNextActionMutation = trpc.inbox.completeNextAction.useMutation({
    onSuccess: onRenamed,
  });
  const [nextActionTitle, setNextActionTitle] = useState(
    contact.nextAction?.title ?? ""
  );
  const [nextActionDueAt, setNextActionDueAt] = useState(
    toLocalDateTimeInput(contact.nextAction?.dueAt)
  );
  useEffect(() => {
    setNameDraft(contact.name);
    setEditingName(false);
  }, [contact.id, contact.name]);
  useEffect(() => {
    setNextActionTitle(contact.nextAction?.title ?? "");
    setNextActionDueAt(toLocalDateTimeInput(contact.nextAction?.dueAt));
  }, [
    contact.id,
    contact.nextAction?.id,
    contact.nextAction?.title,
    contact.nextAction?.dueAt,
  ]);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose]);
  const saveName = () => {
    renameMutation.mutate({
      contactId: Number(contact.id),
      name: nameDraft.trim(),
    });
  };
  const saveNextAction = () => {
    const dueAt = new Date(nextActionDueAt);
    if (!Number.isFinite(dueAt.getTime())) return;
    nextActionMutation.mutate({
      contactId: Number(contact.id),
      title: nextActionTitle.trim(),
      dueAt: dueAt.toISOString(),
    });
  };
  const nextActionState = getNextActionState(contact.nextAction?.dueAt);
  return (
    <div className={`inbox-profile-drawer ${isOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className="inbox-profile-backdrop"
        onClick={onClose}
        aria-label="Fechar ficha do contato"
        tabIndex={isOpen ? 0 : -1}
      />
      <aside
        id="inbox-profile-panel"
        className="inbox-profile-panel"
        role="dialog"
        aria-modal="true"
        aria-label={contact.isGroup ? "Detalhes do grupo" : "Ficha do lead"}
        aria-hidden={!isOpen}
      >
        <div className="profile-header inbox-drawer-header">
          <h3>{contact.isGroup ? "Grupo WhatsApp" : "Ficha do lead"}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar ficha"
          >
            <X size={15} />
          </button>
        </div>
        <div className="profile-body">
          <div className="profile-main">
            <div className="avatar">{contact.initials}</div>
            <h3>{contact.name}</h3>
            {contact.isGroup ? (
              <p>{contact.groupJid || "Grupo sem JID disponível"}</p>
            ) : (
              <>
                <p>{contact.phone}</p>
                <small className="contact-name-source">
                  {contact.nameSource === "manual"
                    ? "Nome salvo manualmente"
                    : "Nome sugerido pelo WhatsApp"}
                </small>
                {contact.pushName && contact.pushName !== contact.name && (
                  <small className="contact-push-name">
                    Push name: {contact.pushName}
                  </small>
                )}
              </>
            )}
          </div>
          {contact.isGroup ? (
            <>
              <div className="profile-fields">
                <div className="profile-field">
                  <span>Instância</span>
                  <strong>{contact.groupInstanceId || "Não identificada"}</strong>
                </div>
                <div className="profile-field">
                  <span>Participantes observados</span>
                  <strong>{contact.groupParticipantCount ?? 0}</strong>
                </div>
                <div className="profile-field">
                  <span>Automação</span>
                  <strong>Desativada para grupos</strong>
                </div>
              </div>
              {contact.groupParticipants?.length ? (
                <div className="group-participant-list" aria-label="Participantes observados no grupo">
                  <strong>Remetentes identificados</strong>
                  {contact.groupParticipants.map(participant => (
                    <div key={participant.jid} className="group-participant-row">
                      <span>{participant.name || participant.jidAlt || participant.jid.split("@")[0]}</span>
                      {participant.isAdmin ? <small>Admin</small> : null}
                    </div>
                  ))}
                  {(contact.groupParticipantCount ?? 0) > contact.groupParticipants.length && (
                    <small>Exibindo os primeiros {contact.groupParticipants.length} remetentes identificados.</small>
                  )}
                </div>
              ) : null}
              <p className="group-safety-note">
                Mensagens de grupos ficam em atendimento humano e não iniciam fluxos da IA nem entram no funil de leads.
              </p>
            </>
          ) : (
            <>
              {editingName ? (
                <div className="profile-name-editor">
                  <label htmlFor="inbox-lead-name">Nome do lead</label>
                  <input
                    id="inbox-lead-name"
                    className="input-control"
                    maxLength={160}
                    value={nameDraft}
                    onChange={event => setNameDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") saveName();
                    }}
                  />
                  {renameMutation.error && (
                    <small role="alert">{renameMutation.error.message}</small>
                  )}
                  <div className="profile-name-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setNameDraft(contact.name);
                        setEditingName(false);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={saveName}
                      disabled={renameMutation.isPending || nameDraft.trim().length < 2}
                    >
                      {renameMutation.isPending ? "Salvando..." : "Salvar nome"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-secondary profile-rename-button"
                  onClick={() => setEditingName(true)}
                >
                  <UserRound size={13} /> Alterar nome do lead
                </button>
              )}
              <div className="profile-fields">
                <div className="profile-field">
                  <span>Serviço</span>
                  <strong>{contact.service}</strong>
                </div>
                <div className="profile-field">
                  <span>Local</span>
                  <strong>
                    {[contact.neighborhood, contact.city].filter(Boolean).join(", ") || "Não informado"}
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
                    {nextActionState === "none"
                      ? "Sem próxima ação"
                      : nextActionState === "overdue"
                        ? "Ação atrasada"
                        : `Agendada · ${formatNextActionDue(contact.nextAction!.dueAt)}`}
                  </strong>
                </div>
              </div>
              {!platformAdmin && (
                <section
                  className="inbox-operational-panel"
                  aria-label="Responsável e próxima ação"
                >
                  <h4>Responsável</h4>
                  {assignmentOptionsQuery.data?.canAssign ? (
                    <label>
                      <span>Responsável comercial</span>
                      <select
                        className="select-control"
                        value={contact.assignedMemberId ?? ""}
                        disabled={
                          !contact.opportunityId || assignMutation.isPending
                        }
                        onChange={event =>
                          assignMutation.mutate({
                            contactId: Number(contact.id),
                            assignedMemberId: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {assignmentOptionsQuery.data.members.map(member => (
                          <option key={member.id} value={member.id}>
                            {member.name} · {member.role}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="profile-field">
                      <span>Responsável atual</span>
                      <strong>{contact.assignedMemberName || "Sem responsável"}</strong>
                    </div>
                  )}
                  {assignMutation.error && (
                    <small className="profile-error" role="alert">
                      {assignMutation.error.message}
                    </small>
                  )}
                  {!contact.opportunityId && (
                    <small>Este contato ainda não possui uma oportunidade operacional.</small>
                  )}

                  <div className="next-action-current">
                    <span>Próxima ação registrada</span>
                    <strong>
                      {contact.nextAction?.title || "Nenhuma ação agendada"}
                    </strong>
                    {contact.nextAction && (
                      <small>
                        {formatNextActionDue(contact.nextAction.dueAt)}
                      </small>
                    )}
                    {contact.nextAction && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={completeNextActionMutation.isPending}
                        onClick={() =>
                          completeNextActionMutation.mutate({
                            contactId: Number(contact.id),
                          })
                        }
                      >
                        {completeNextActionMutation.isPending
                          ? "Concluindo..."
                          : "Marcar como concluída"}
                      </button>
                    )}
                  </div>
                  <label>
                    <span>Descrição da próxima ação</span>
                    <input
                      className="input-control"
                      maxLength={180}
                      value={nextActionTitle}
                      disabled={!contact.opportunityId}
                      onChange={event => setNextActionTitle(event.target.value)}
                      placeholder="Ex.: Retornar com o orçamento"
                    />
                  </label>
                  <label>
                    <span>Prazo</span>
                    <input
                      className="input-control"
                      type="datetime-local"
                      value={nextActionDueAt}
                      disabled={!contact.opportunityId}
                      onChange={event => setNextActionDueAt(event.target.value)}
                    />
                  </label>
                  {(nextActionMutation.error ||
                    completeNextActionMutation.error) && (
                    <small className="profile-error" role="alert">
                      {nextActionMutation.error?.message ||
                        completeNextActionMutation.error?.message}
                    </small>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      !contact.opportunityId ||
                      nextActionMutation.isPending ||
                      nextActionTitle.trim().length < 3 ||
                      !nextActionDueAt
                    }
                    onClick={saveNextAction}
                  >
                    {nextActionMutation.isPending
                      ? "Salvando..."
                      : contact.nextAction
                        ? "Atualizar próxima ação"
                        : "Agendar próxima ação"}
                  </button>
                </section>
              )}
              <div className="profile-actions">
                <PageLink href={`/contacts/${contact.id}`} className="btn-secondary">
                  <UserRound size={13} /> Abrir ficha completa
                </PageLink>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function InboxChrome({
  platformAdmin,
  children,
}: {
  platformAdmin: boolean;
  children: React.ReactNode;
}) {
  return platformAdmin ? (
    <PlatformShell
      title="Inbox de suporte"
      description="Conversas do WhatsApp próprio do Console Admin."
      active="support-inbox"
    >
      {children}
    </PlatformShell>
  ) : (
    <PanelLayout
      eyebrow="WhatsApp / Conversas"
      title="WhatsApp"
      description="Conversas individuais e grupos conectados ao Forte Panel."
      showHeading={false}
    >
      {children}
    </PanelLayout>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Não foi possível ler o anexo."));
    reader.onerror = () => reject(new Error("Não foi possível ler o anexo."));
    reader.readAsDataURL(file);
  });
}

export function InboxPage({ platformAdmin = false }: { platformAdmin?: boolean } = {}) {
  const [selectedId, setSelectedId] = useState("");
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"Todas" | "Individuais" | "Grupos">("Todas");
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[] | null>(null);
  const [sendInstanceId, setSendInstanceId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [interactiveType, setInteractiveType] = useState<"text" | "button" | "list" | "poll" | "carousel">("text");
  const [interactiveOptions, setInteractiveOptions] = useState("Sim\nNão");
  const [interactiveButtonText, setInteractiveButtonText] = useState("Ver opções");
  const [carouselPayload, setCarouselPayload] = useState('{"cards":[]}');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [attachment, setAttachment] = useState<{
    file: File;
    name: string;
    type: "image" | "audio" | "video" | "document";
    mimeType: string;
    previewUrl?: string;
    storageKey?: string;
    sizeBytes?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const attachmentPreviewUrlRef = useRef("");
  const markedReadRef = useRef(new Set<string>());
  const clearAttachment = () => {
    if (attachmentPreviewUrlRef.current)
      URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    attachmentPreviewUrlRef.current = "";
    setAttachment(null);
    setRecordingError("");
  };
  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      if (recordingTimerRef.current !== null)
        window.clearInterval(recordingTimerRef.current);
      if (attachmentPreviewUrlRef.current)
        URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    },
    []
  );
  const inbox = (platformAdmin ? trpc.platform.supportInbox : trpc.inbox) as typeof trpc.inbox;
  const uploadAttachmentMutation = inbox.uploadAttachment.useMutation();
  const instancesQuery = inbox.instances.useQuery();
  const contactsQuery = inbox.contacts.useQuery({
    instanceIds: selectedInstanceIds,
    includeGroups: true,
  });
  const remoteContacts = contactsQuery.data ?? [];
  const items = remoteContacts;
  const filtered = useMemo(
    () =>
      items.filter(contact => {
        const matchesSearch = `${contact.name} ${contact.phone} ${contact.groupJid ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesKind =
          kindFilter === "Todas" ||
          (kindFilter === "Grupos" ? contact.isGroup === true : contact.isGroup !== true);
        return matchesSearch && matchesKind;
      }),
    [items, search, kindFilter]
  );

  useEffect(() => {
    const requestedId = new URLSearchParams(location.split("?")[1] ?? "").get(
      "instanceId"
    );
    if (
      requestedId &&
      instancesQuery.data?.some(instance => instance.instanceId === requestedId)
    ) {
      if (platformAdmin) setSendInstanceId(requestedId);
      setSelectedInstanceIds(current =>
        current?.length === 1 && current[0] === requestedId
          ? current
          : [requestedId]
      );
    }
  }, [instancesQuery.data, location, platformAdmin]);
  useEffect(() => {
    if (!instancesQuery.data || selectedInstanceIds === null) return;
    const available = new Set(instancesQuery.data.map(instance => instance.instanceId));
    const remaining = selectedInstanceIds.filter(id => available.has(id));
    if (remaining.length !== selectedInstanceIds.length)
      setSelectedInstanceIds(remaining.length > 0 ? remaining : null);
  }, [instancesQuery.data, selectedInstanceIds]);
  useEffect(() => {
    if (!platformAdmin || !instancesQuery.data?.length) return;
    if (!instancesQuery.data.some(instance => instance.instanceId === sendInstanceId))
      setSendInstanceId("");
  }, [instancesQuery.data, platformAdmin, sendInstanceId]);

  useEffect(() => {
    const requestedId = new URLSearchParams(location.split("?")[1] ?? "").get(
      "contactId"
    );
    if (requestedId && filtered.some(contact => contact.id === requestedId))
      setSelectedId(requestedId);
    else if (
      filtered.length > 0 &&
      !filtered.some(contact => contact.id === selectedId)
    )
      setSelectedId(filtered[0].id);
    else if (filtered.length === 0 && selectedId)
      setSelectedId("");
  }, [filtered, selectedId, location]);

  const selected = filtered.find(contact => contact.id === selectedId) ?? filtered[0];
  useEffect(() => {
    setProfileOpen(false);
  }, [selected?.id]);
  const selectedNumericId = Number(selected?.id ?? 0);
  const threadInput = useMemo(
    () => ({ contactId: selectedNumericId, instanceIds: selectedInstanceIds }),
    [selectedNumericId, selectedInstanceIds]
  );
  const threadQuery = inbox.thread.useQuery(threadInput, {
    enabled: selectedNumericId > 0,
    refetchInterval: selectedNumericId > 0 ? 10_000 : false,
  });
  const latestMessageId =
    threadQuery.data?.messages?.[threadQuery.data.messages.length - 1]?.id ??
    "";
  const markReadMutation = inbox.markRead.useMutation({
    onSuccess: () => contactsQuery.refetch(),
  });
  useEffect(() => {
    if (
      selectedNumericId <= 0 ||
      selectedInstanceIds !== null ||
      !selected ||
      selected.unread <= 0 ||
      !latestMessageId
    )
      return;
    const key = `${selectedNumericId}:${latestMessageId}`;
    if (markedReadRef.current.has(key)) return;
    markedReadRef.current.add(key);
    markReadMutation.mutate(
      { contactId: selectedNumericId },
      {
        onError: () => markedReadRef.current.delete(key),
      }
    );
  }, [latestMessageId, selected, selectedNumericId, selectedInstanceIds]);
  const refresh = async () => {
    await Promise.all([contactsQuery.refetch(), threadQuery.refetch()]);
  };
  const toggleAiMutation = inbox.toggleAi.useMutation({
    onSuccess: refresh,
  });
  const sendMutation = inbox.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      setInteractiveType("text");
      setInteractiveOptions("Sim\nNão");
      clearAttachment();
      await refresh();
    },
  });
  if (!selected)
    return (
      <InboxChrome platformAdmin={platformAdmin}>
        {contactsQuery.isLoading || instancesQuery.isLoading ? (
          <EmptyState
            icon={MessageCircle}
            title="Carregando conversas"
            description="Buscando os contatos persistidos deste workspace."
          />
        ) : contactsQuery.isError || instancesQuery.isError ? (
          <div className="inbox-query-error">
            <EmptyState
              icon={WifiOff}
              title="Não foi possível carregar a Inbox"
              description="Verifique a conexão e tente novamente."
            />
            <button
              className="btn-secondary"
              onClick={() => void Promise.all([contactsQuery.refetch(), instancesQuery.refetch()])}
            >
              <RefreshCw size={13} /> Tentar novamente
            </button>
          </div>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title={selectedInstanceIds ? "Nenhuma conversa nestas instâncias" : kindFilter === "Grupos" ? "Nenhum grupo encontrado" : "Nenhuma conversa encontrada"}
            description={selectedInstanceIds ? "Escolha outras instâncias ou selecione Todas." : kindFilter !== "Todas" ? "Altere o filtro de conversas para ver outros chats." : "Quando o primeiro WhatsApp chegar, a conversa aparecerá aqui."}
          />
        )}
      </InboxChrome>
    );

  const messages = threadQuery.data?.messages ?? [];
  const toggleAi = () => {
    if (selected.isGroup) return;
    toggleAiMutation.mutate({
      contactId: selectedNumericId,
      enabled: !selected.aiEnabled,
    });
  };
  const send = async () => {
    if (!draft.trim() && !attachment) return;
    if (platformAdmin && !sendInstanceId) {
      setRecordingError("Selecione a instância que fará o envio.");
      return;
    }
    const outboundInstanceIds = platformAdmin ? [sendInstanceId] : selectedInstanceIds;
    const currentAttachment = attachment;
    if (currentAttachment) {
      const caption = draft.trim();
      if (caption.length > 1024) {
        setRecordingError("A legenda do anexo pode ter no máximo 1.024 caracteres.");
        return;
      }
      setRecordingError("");
      try {
        const uploaded = currentAttachment.storageKey
          ? {
              storageKey: currentAttachment.storageKey,
              fileName: currentAttachment.name,
              mimeType: currentAttachment.mimeType,
              sizeBytes: currentAttachment.sizeBytes ?? currentAttachment.file.size,
            }
          : await uploadAttachmentMutation.mutateAsync({
              fileName: currentAttachment.name,
              messageType: currentAttachment.type,
              mimeType: currentAttachment.mimeType,
              dataUrl: await readFileAsDataUrl(currentAttachment.file),
            });
        setAttachment(current =>
          current?.file === currentAttachment.file
            ? {
                ...current,
                name: uploaded.fileName,
                mimeType: uploaded.mimeType,
                storageKey: uploaded.storageKey,
                sizeBytes: uploaded.sizeBytes,
              }
            : current
        );
        sendMutation.mutate({
          contactId: selectedNumericId,
          content: caption || uploaded.fileName,
          messageType: currentAttachment.type,
          metadata: {
            mediaStorageKey: uploaded.storageKey,
            mediaMimeType: uploaded.mimeType,
            mediaSizeBytes: uploaded.sizeBytes,
            fileName: uploaded.fileName,
            ...(caption ? { caption } : {}),
          },
          instanceIds: outboundInstanceIds,
        });
      } catch (error) {
        setRecordingError(
          error instanceof Error
            ? error.message
            : "Não foi possível guardar o anexo com segurança."
        );
      }
      return;
    }
    const options = interactiveOptions
      .split("\n")
      .map(option => option.trim())
      .filter(Boolean);
    if (interactiveType === "carousel") {
      try {
        const parsed = JSON.parse(carouselPayload) as Record<string, unknown>;
        if (!Array.isArray(parsed.cards) || parsed.cards.length === 0)
          throw new Error("O carousel precisa de pelo menos um card");
        sendMutation.mutate({
          contactId: selectedNumericId,
          content: draft.trim() || "Carrossel",
          messageType: "carousel",
          metadata: { payload: { interactiveMessage: { carouselMessage: parsed } } },
          instanceIds: outboundInstanceIds,
        });
        return;
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : "JSON de carousel inválido");
        return;
      }
    }
    const interactiveMetadata =
      interactiveType === "button"
        ? {
            buttons: options.slice(0, 3).map((option, index) => ({
              buttonId: `option-${index + 1}`,
              buttonText: { displayText: option },
            })),
          }
        : interactiveType === "list"
          ? {
              buttonText: interactiveButtonText,
              sections: [{ title: "Opções", rows: options.slice(0, 10).map((option, index) => ({ rowId: `option-${index + 1}`, title: option })) }],
            }
          : interactiveType === "poll"
            ? { payload: { poll: { name: draft.trim(), values: options.slice(0, 12), selectableCount: 1 } } }
            : undefined;
    sendMutation.mutate({
      contactId: selectedNumericId,
      content: draft.trim(),
      messageType: interactiveType,
      metadata: interactiveMetadata,
      instanceIds: outboundInstanceIds,
    });
  };
  const selectAttachment = (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setRecordingError("O áudio/anexo excede o limite de 8 MB.");
      return;
    }
    if (attachmentPreviewUrlRef.current)
      URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    attachmentPreviewUrlRef.current = "";
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";
    const previewUrl = type === "audio" ? URL.createObjectURL(file) : undefined;
    attachmentPreviewUrlRef.current = previewUrl ?? "";
    setAttachment({
      file,
      name: file.name,
      type,
      mimeType: file.type || "application/octet-stream",
      previewUrl,
    });
    setRecordingError("");
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording")
      mediaRecorderRef.current.stop();
  };
  const startRecording = async () => {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Este navegador não permite gravação de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];
      const preferredMime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferredMime ? { mimeType: preferredMime } : undefined
      );
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setRecordingError("A gravação falhou. Verifique o microfone e tente novamente.");
        stopRecording();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        if (recordingTimerRef.current !== null) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];
        if (!blob.size) {
          setRecordingError("A gravação ficou vazia; tente novamente.");
          return;
        }
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        selectAttachment(
          new File([blob], `gravacao-whatsapp.${extension}`, { type: mimeType })
        );
      };
      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= 600) {
          setRecordingError("Gravação encerrada no limite de 10 minutos.");
          stopRecording();
        }
      }, 1000);
    } catch {
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setRecordingError("Permita o acesso ao microfone para gravar um áudio.");
    }
  };
  return (
    <InboxChrome platformAdmin={platformAdmin}>
      <div className="filter-bar">
        <div className="search-field">
          <Search size={14} />
          <input
            className="input-control"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar conversas, contatos ou grupos"
          />
        </div>
        <div className="inbox-kind-tabs" role="tablist" aria-label="Tipo de conversa">
          {(["Todas", "Individuais", "Grupos"] as const).map(kind => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={kindFilter === kind}
              className={kindFilter === kind ? "is-active" : ""}
              onClick={() => setKindFilter(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
        <details className="inbox-instance-filter">
          <summary className="btn-secondary">
            <Filter size={13} /> Instâncias: {selectedInstanceIds === null ? "Todas" : `${selectedInstanceIds.length} selecionada(s)`}
          </summary>
          <div className="inbox-instance-options">
            <label>
              <input
                type="checkbox"
                checked={selectedInstanceIds === null}
                onChange={() => setSelectedInstanceIds(null)}
              />
              Todas as instâncias
            </label>
            {instancesQuery.isLoading ? (
              <small>Carregando instâncias...</small>
            ) : instancesQuery.isError ? (
              <button className="btn-ghost" onClick={() => void instancesQuery.refetch()}>
                Falha ao carregar. Tentar novamente
              </button>
            ) : instancesQuery.data?.length ? (
              instancesQuery.data.map(instance => (
                <label key={instance.instanceId}>
                  <input
                    type="checkbox"
                    checked={selectedInstanceIds?.includes(instance.instanceId) ?? false}
                    onChange={event => {
                      const checked = event.currentTarget.checked;
                      setSelectedInstanceIds(current => {
                        if (checked)
                          return current === null
                            ? [instance.instanceId]
                            : Array.from(new Set([...current, instance.instanceId]));
                        if (current === null) return null;
                        const remaining = current.filter(id => id !== instance.instanceId);
                        return remaining.length ? remaining : null;
                      });
                    }}
                  />
                  {instance.name}
                </label>
              ))
            ) : (
              <small>Nenhuma instância ativa neste workspace.</small>
            )}
          </div>
        </details>
        {platformAdmin && (
          <label className="inbox-send-instance">
            <span>Enviar pela</span>
            <select
              className="select-control"
              value={sendInstanceId}
              onChange={event => setSendInstanceId(event.target.value)}
            >
              <option value="">Selecione uma instância</option>
              {(instancesQuery.data ?? []).map(instance => (
                <option key={instance.instanceId} value={instance.instanceId}>
                  {instance.name} · {instance.status}
                </option>
              ))}
            </select>
          </label>
        )}
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
                  {selected.isGroup
                    ? `Grupo${selected.groupInstanceId ? ` · ${selected.groupInstanceId}` : ""}`
                    : selected.phone}
                </small>
              </div>
            </div>
            <div className="chat-actions">
              {selected.isGroup ? (
                <StatusBadge tone="blue">Atendimento humano</StatusBadge>
              ) : (
                <button
                  type="button"
                  className={`chat-ai-toggle ${selected.aiEnabled ? "is-active" : "is-paused"}`}
                  onClick={toggleAi}
                  disabled={toggleAiMutation.isPending}
                  aria-label={selected.aiEnabled ? "Pausar IA nesta conversa" : "Reativar IA nesta conversa"}
                  title={selected.aiEnabled ? "Pausar IA nesta conversa" : "Reativar IA nesta conversa"}
                >
                  {selected.aiEnabled ? <Pause size={13} /> : <Play size={13} />}
                  {selected.aiEnabled ? "Pausar IA" : "Reativar IA"}
                </button>
              )}
              <button
                type="button"
                className={`btn-secondary chat-profile-toggle ${profileOpen ? "is-active" : ""}`}
                aria-expanded={profileOpen}
                aria-controls="inbox-profile-panel"
                onClick={() => setProfileOpen(open => !open)}
              >
                <UserRound size={13} /> {selected.isGroup ? "Grupo" : "Ficha"}
              </button>
            </div>
          </div>
          <div className="chat-body">
            {threadQuery.isLoading ? (
              <EmptyState icon={MessageCircle} title="Carregando mensagens" description="Buscando o histórico desta conversa." />
            ) : threadQuery.isError ? (
              <div className="inbox-query-error">
                <EmptyState
                  icon={WifiOff}
                  title="Não foi possível carregar as mensagens"
                  description="O histórico não foi alterado. Tente novamente."
                />
                <button className="btn-secondary" onClick={() => void threadQuery.refetch()}>
                  <RefreshCw size={13} /> Tentar novamente
                </button>
              </div>
            ) : messages.length ? (
              messages.map(message => <MessageBubble key={message.id} message={message} />)
            ) : (
              <EmptyState icon={MessageCircle} title="Nenhuma mensagem nesta instância" description="Selecione outra instância ou escolha Todas para ver o histórico completo." />
            )}
          </div>
          {attachment && (
            <div className="chat-attachment-preview">
              <div>
                <strong>{attachment.name}</strong>
                <small>{attachment.type} · até 8 MB</small>
              </div>
              {attachment.previewUrl && (
                <audio controls preload="metadata" src={attachment.previewUrl} aria-label="Prévia do áudio" />
              )}
              <button
                className="icon-button"
                type="button"
                aria-label="Remover anexo"
                onClick={clearAttachment}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {(isRecording || recordingError) && (
            <div className={`chat-recording-status ${isRecording ? "is-recording" : ""}`} aria-live="polite">
              {isRecording && <span className="recording-dot" />}
              {isRecording
                ? `Gravando áudio · ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`
                : recordingError}
            </div>
          )}
          {sendMutation.error && (
            <div className="chat-send-error" role="alert">
              Não foi possível enviar. O texto/anexo foi mantido para tentar novamente.
            </div>
          )}
          {interactiveType !== "text" && !attachment && (
            <div className="chat-interactive-editor">
              <label>
                <span>Mensagem interativa</span>
                <select className="select-control" value={interactiveType} onChange={event => setInteractiveType(event.target.value as typeof interactiveType)}>
                  <option value="button">Botões</option>
                  <option value="list">Lista</option>
                  <option value="poll">Enquete</option>
                  <option value="carousel">Carousel (JSON Baileys)</option>
                </select>
              </label>
              {interactiveType === "carousel" && (
                <label>
                  <span>InteractiveMessage.carouselMessage</span>
                  <textarea className="textarea-control" value={carouselPayload} onChange={event => setCarouselPayload(event.target.value)} rows={6} />
                </label>
              )}
              {interactiveType !== "carousel" && <label>
                <span>Opções, uma por linha</span>
                <textarea className="textarea-control" value={interactiveOptions} onChange={event => setInteractiveOptions(event.target.value)} rows={3} />
              </label>}
              {interactiveType === "list" && (
                <label>
                  <span>Texto do botão</span>
                  <input className="input-control" value={interactiveButtonText} onChange={event => setInteractiveButtonText(event.target.value)} />
                </label>
              )}
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
            <input
              ref={audioFileInputRef}
              type="file"
              hidden
              accept="audio/*"
              onChange={event => {
                selectAttachment(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <button
              className="icon-button"
              type="button"
              aria-label="Anexar arquivo"
              disabled={isRecording || sendMutation.isPending || uploadAttachmentMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Anexar arquivo de áudio"
              title="Anexar um áudio existente"
              disabled={isRecording || sendMutation.isPending || uploadAttachmentMutation.isPending}
              onClick={() => audioFileInputRef.current?.click()}
            >
              <Headphones size={16} />
            </button>
            <button
              className={`icon-button chat-record-button ${isRecording ? "is-recording" : ""}`}
              type="button"
              aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
              aria-pressed={isRecording}
              title={isRecording ? "Parar gravação" : "Gravar áudio pelo microfone"}
              disabled={sendMutation.isPending || uploadAttachmentMutation.isPending}
              onClick={() => (isRecording ? stopRecording() : void startRecording())}
            >
              {isRecording ? <Square size={14} /> : <Mic size={16} />}
            </button>
            <button
              className={`icon-button ${interactiveType !== "text" ? "is-active" : ""}`}
              type="button"
              aria-label="Mensagem interativa"
              title="Enviar botões, lista ou enquete"
              disabled={isRecording || sendMutation.isPending || uploadAttachmentMutation.isPending || Boolean(attachment)}
              onClick={() => setInteractiveType(current => current === "text" ? "button" : "text")}
            >
              <ClipboardList size={16} />
            </button>
            <input
              className="input-control"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              disabled={sendMutation.isPending || uploadAttachmentMutation.isPending || isRecording}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) void send();
              }}
              placeholder={selected.isGroup ? "Mensagem para o grupo..." : "Escrever resposta..."}
            />
            <button
              className="btn-primary"
              onClick={() => void send()}
              disabled={sendMutation.isPending || uploadAttachmentMutation.isPending || isRecording || (!draft.trim() && !attachment) || (platformAdmin && !sendInstanceId)}
              aria-label={uploadAttachmentMutation.isPending ? "Enviando anexo para armazenamento privado" : "Enviar mensagem"}
              title={platformAdmin && !sendInstanceId ? "Selecione a instância de envio" : uploadAttachmentMutation.isPending ? "Guardando anexo com segurança…" : "Enviar mensagem"}
            >
              <Send size={14} />
            </button>
          </div>
        </section>
        <ConversationProfile
          contact={selected}
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          onRenamed={refresh}
          platformAdmin={platformAdmin}
        />
      </div>
    </InboxChrome>
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
  const rescheduleMutation = trpc.agenda.reschedule.useMutation({
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
        startsAt,
        endsAt,
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
  const rescheduleAppointment = (appointment: (typeof agendaItems)[number]) => {
    const nextDate = window.prompt("Nova data (AAAA-MM-DD)", appointment.startsAt.toISOString().slice(0, 10));
    if (!nextDate) return;
    const nextTime = window.prompt("Novo horário (HH:MM)", appointment.time);
    if (!nextTime) return;
    const startsAt = new Date(`${nextDate}T${nextTime}:00`);
    const endsAt = new Date(startsAt.getTime() + Number.parseInt(appointment.duration, 10) * 60000);
    rescheduleMutation.mutate({ id: Number(appointment.id), startsAt, endsAt });
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
                {(contactsQuery.data ?? []).map(contact => (
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
              className="form-error"
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
                            {appointment.status !== "Cancelado" &&
                              appointment.status !== "Concluído" && (
                                <button
                                  className="btn-secondary"
                                  disabled={rescheduleMutation.isPending}
                                  onClick={() => rescheduleAppointment(appointment)}
                                >
                                  Reagendar
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

export function IntegrationsPage() {
  return <WhatsappConnectionPage />;
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
