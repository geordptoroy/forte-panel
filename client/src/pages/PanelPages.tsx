import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Filter,
  Headphones,
  ImagePlus,
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
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  UsersRound,
  WalletCards,
  Zap,
} from "lucide-react";
import PanelLayout, { EmptyState, PageLink, SectionTitle, StatusBadge, ViewToggle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import {
  appointments,
  contacts,
  events,
  formatCurrency,
  getContact,
  integrations,
  messagesByContact,
  quotes,
  stageOrder,
  type Contact,
  type Message,
  type Stage,
} from "@/lib/demoData";

function DemoBanner() {
  return <div className="demo-banner"><Info size={15} /><span><strong>Modo demonstração:</strong> os dados são seed local e nenhuma mensagem externa é enviada para PAPI ou n8n.</span></div>;
}

function StatCard({ label, value, foot, icon: Icon, tone = "neutral" }: { label: string; value: string; foot: string; icon: typeof UsersRound; tone?: string }) {
  return <div className="surface surface-hover stat-card"><div className="stat-top"><span className="stat-label">{label}</span><Icon size={16} className={tone} /></div><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span></div>;
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  return <PanelLayout eyebrow="Operação / Overview" title="Dashboard" description="Acompanhe o atendimento do Gabriel em um único lugar.">
    <DemoBanner />
    <div className="stat-grid">
      <PageLink href="/contacts"><StatCard label="Novos contatos hoje" value="08" foot="+3 desde ontem" icon={UsersRound} tone="blue" /></PageLink>
      <PageLink href="/inbox"><StatCard label="Aguardando resposta" value="03" foot="2 com alta urgência" icon={MessageCircle} tone="amber" /></PageLink>
      <PageLink href="/inbox"><StatCard label="IA pausada" value="02" foot="Controle humano ativo" icon={Pause} tone="amber" /></PageLink>
      <PageLink href="/kanban"><StatCard label="Urgências abertas" value="01" foot="Requer atenção agora" icon={Zap} tone="red" /></PageLink>
      <PageLink href="/billing"><StatCard label="Orçamentos pendentes" value={formatCurrency(2_000)} foot="4 registros no período" icon={FileText} tone="blue" /></PageLink>
      <PageLink href="/agenda"><StatCard label="Agendamentos hoje" value="02" foot="Próximo às 14:00" icon={CalendarCheck2} tone="green" /></PageLink>
      <PageLink href="/billing"><StatCard label="Recebido no mês" value={formatCurrency(1_840)} foot="+18% vs. mês anterior" icon={WalletCards} tone="green" /></PageLink>
      <PageLink href="/billing"><StatCard label="Valor pendente" value={formatCurrency(2_380)} foot="3 clientes aguardando" icon={CircleDollarSign} tone="amber" /></PageLink>
    </div>
    <div className="dashboard-grid">
      <section><SectionTitle eyebrow="Atividade recente" title="Últimos eventos" action={<PageLink href="/inbox" className="btn-ghost">Ver tudo <ArrowUpRight size={13} /></PageLink>} /><div className="surface" style={{ padding: "0 17px" }}>{events.map((event) => <div className="event-row" key={event.title}><div className="event-icon"><EventIcon type={event.type} /></div><div className="row-copy"><strong>{event.title}</strong><small>{event.meta}</small></div><span className="row-meta">{event.time}</span></div>)}</div></section>
      <section><SectionTitle eyebrow="Próximos horários" title="Agenda" action={<PageLink href="/agenda" className="btn-ghost">Abrir agenda <ArrowUpRight size={13} /></PageLink>} /><div className="surface" style={{ padding: "0 17px" }}>{appointments.slice(0, 3).map((appointment) => { const contact = getContact(appointment.contactId); return <div className="appointment-row" key={appointment.id}><div className="time-block">{appointment.time}</div><div className="row-copy"><strong>{contact.name}</strong><small>{appointment.service} · {appointment.date}</small></div><StatusBadge tone={appointment.status === "Confirmado" ? "green" : "amber"}>{appointment.status}</StatusBadge></div>; })}</div></section>
    </div>
  </PanelLayout>;
}

function ConversationList({ items, selectedId, onSelect }: { items: ContactLike[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="inbox-list"><div className="inbox-list-header"><span className="eyebrow">Conversas</span><div className="inbox-count">{items.length} conversas indexadas</div></div>{items.map((contact) => <button key={contact.id} onClick={() => onSelect(contact.id)} className={`conversation-item ${selectedId === contact.id ? "is-selected" : ""}`}><div className="avatar">{contact.initials}</div><div className="conversation-copy"><div className="conversation-title"><strong>{contact.name}</strong>{contact.unread > 0 && <span className="unread-pill">{contact.unread}</span>}</div><div className="conversation-preview">{contact.lastMessage}</div><div className="conversation-bottom"><span>{formatChatTime(contact.lastMessageAt)}</span><span className={`ai-indicator ${contact.aiEnabled ? "" : "paused"}`}>{contact.aiEnabled ? "IA ativa" : "IA pausada"}</span></div></div></button>)}</div>;
}

function MessageBubble({ message }: { message: Message }) {
  const author = message.sender === "lead" ? "Lead" : message.sender === "ai" ? "IA automática" : message.sender === "human" ? "Gabriel" : "Sistema";
  const time = message.time.includes("T") ? new Date(message.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : message.time;
  return <div className={`message-row from-${message.sender}`}><div className="message-bubble"><div className="message-author">{author}</div><div className="message-text">{message.text}</div><div className="message-time">{time} {message.sender !== "system" && <Check size={10} style={{ display: "inline", verticalAlign: "middle" }} />}</div></div></div>;
}

function ConversationProfile({ contact, onToggleAi }: { contact: ContactLike; onToggleAi: () => void }) {
  return <div className="inbox-profile"><div className="profile-header"><h3>Ficha resumida</h3></div><div className="profile-body"><div className="profile-main"><div className="avatar">{contact.initials}</div><h3>{contact.name}</h3><p>{contact.phone}</p></div><div className="profile-fields"><div className="profile-field"><span>Serviço</span><strong>{contact.service}</strong></div><div className="profile-field"><span>Local</span><strong>{contact.neighborhood}, {contact.city}</strong></div><div className="profile-field"><span>Urgência</span><strong className={contact.urgency === "Crítica" || contact.urgency === "Alta" ? "red" : "amber"}>{contact.urgency}</strong></div><div className="profile-field"><span>Estágio</span><strong>{contact.stage}</strong></div><div className="profile-field"><span>Orçamento</span><strong>{formatCurrency(contact.quote)}</strong></div><div className="profile-field"><span>Próxima ação</span><strong>{contact.daysNoReply > 0 ? "Fazer follow-up" : "Aguardar retorno"}</strong></div></div><div className="profile-actions"><button className="btn-secondary" onClick={onToggleAi}>{contact.aiEnabled ? <><Pause size={13} /> Pausar IA</> : <><Play size={13} /> Reativar IA</>}</button><PageLink href={`/contacts/${contact.id}`} className="btn-secondary"><UserRound size={13} /> Abrir ficha completa</PageLink><button className="btn-ghost"><Tag size={13} /> Adicionar nota</button></div></div></div>;
}

export function InboxPage() {
  const [selectedId, setSelectedId] = useState("1");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Todos");
  const [localContacts, setLocalContacts] = useState(contacts);
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<string, Message[]>>({});
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const remoteContacts = contactsQuery.data ?? [];
  const usingRemote = remoteContacts.length > 0;
  const items = usingRemote ? remoteContacts : localContacts;

  useEffect(() => {
    if (items.length > 0 && !items.some((contact) => contact.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selected = items.find((contact) => contact.id === selectedId) ?? items[0];
  const selectedNumericId = Number(selected?.id ?? 0);
  const threadInput = useMemo(() => ({ contactId: selectedNumericId }), [selectedNumericId]);
  const threadQuery = trpc.inbox.thread.useQuery(threadInput, { enabled: usingRemote && selectedNumericId > 0 });
  const refresh = async () => { await Promise.all([contactsQuery.refetch(), threadQuery.refetch()]); };
  const toggleAiMutation = trpc.inbox.toggleAi.useMutation({ onSuccess: refresh });
  const sendMutation = trpc.inbox.sendMessage.useMutation({ onSuccess: refresh });
  const filtered = useMemo(() => items.filter((contact) => `${contact.name} ${contact.phone}`.toLowerCase().includes(search.toLowerCase()) && (stageFilter === "Todos" || contact.stage === stageFilter)), [items, search, stageFilter]);

  if (!selected) return <PanelLayout eyebrow="Operação / Atendimento" title="Inbox" description="Converse com seus clientes sem sair do painel."><DemoBanner /><EmptyState icon={MessageCircle} title="Nenhuma conversa encontrada" description="Configure uma integração ou carregue dados demo para começar." /></PanelLayout>;

  const fallbackMessages = [...(messagesByContact[selected.id] ?? []), ...(sentMessages[selected.id] ?? [])];
  const messages = usingRemote ? (threadQuery.data?.messages ?? []) : fallbackMessages;
  const toggleAi = () => {
    if (usingRemote) toggleAiMutation.mutate({ contactId: selectedNumericId, enabled: !selected.aiEnabled });
    else setLocalContacts((items) => items.map((item) => item.id === selected.id ? { ...item, aiEnabled: !item.aiEnabled } : item));
  };
  const send = () => {
    if (!draft.trim()) return;
    if (usingRemote) sendMutation.mutate({ contactId: selectedNumericId, content: draft.trim() });
    else {
      setSentMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), { id: `manual-${Date.now()}`, sender: "human", text: draft.trim(), time: "agora" }] }));
      setLocalContacts((items) => items.map((item) => item.id === selected.id ? { ...item, aiEnabled: false, lastMessage: draft.trim(), lastMessageAt: "agora", unread: 0 } : item));
    }
    setDraft("");
  };
  return <PanelLayout eyebrow="Operação / Atendimento" title="Inbox" description="Converse com seus clientes sem sair do painel." actions={<button className="btn-primary"><Plus size={13} /> Nova conversa</button>}>
    <DemoBanner />
    <div className="filter-bar"><div className="search-field"><Search size={14} /><input className="input-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" /></div><select className="select-control" style={{ width: 160 }} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option>Todos</option>{stageOrder.map((stage) => <option key={stage}>{stage}</option>)}</select><button className="btn-secondary"><Filter size={13} /> Filtros</button></div>
    <div className="inbox-layout"><ConversationList items={filtered} selectedId={selected.id} onSelect={setSelectedId} /><section className="inbox-chat"><div className="chat-header"><div className="chat-contact"><div className="avatar">{selected.initials}</div><div><strong>{selected.name}</strong><small>{selected.phone} · {selected.service}</small></div></div><div className="chat-actions"><StatusBadge tone={selected.aiEnabled ? "green" : "amber"}>{selected.aiEnabled ? "IA ativa" : "IA pausada"}</StatusBadge><button className="icon-button"><MoreHorizontal size={17} /></button></div></div><div className="chat-body">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div><div className="chat-composer"><button className="icon-button" aria-label="Anexar arquivo"><Paperclip size={16} /></button><button className="icon-button" aria-label="Adicionar imagem"><ImagePlus size={16} /></button><input className="input-control" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="Escrever resposta manual..." /><button className="btn-primary" onClick={send} disabled={sendMutation.isPending} aria-label="Enviar mensagem"><Send size={14} /></button></div></section><ConversationProfile contact={selected} onToggleAi={toggleAi} /></div>
  </PanelLayout>;
}

export function KanbanPage() {
  const [localContacts, setLocalContacts] = useState(contacts);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const remoteContacts = contactsQuery.data ?? [];
  const usingRemote = remoteContacts.length > 0;
  const items = usingRemote ? remoteContacts : localContacts;
  const moveMutation = trpc.inbox.moveStage.useMutation({ onSuccess: () => contactsQuery.refetch() });
  const moveContact = (id: string, stage: string) => {
    if (usingRemote) moveMutation.mutate({ contactId: Number(id), stage });
    else setLocalContacts((current) => current.map((item) => item.id === id ? { ...item, stage: stage as Stage } : item));
  };
  return <PanelLayout eyebrow="Operação / Comercial" title="Kanban" description="Acompanhe cada lead até a conclusão do serviço." actions={<button className="btn-primary"><Plus size={13} /> Novo lead</button>}>
    <DemoBanner />
    <div className="filter-bar"><div className="search-field"><Search size={14} /><input className="input-control" placeholder="Buscar no funil" /></div><button className="btn-secondary"><Filter size={13} /> Filtrar por urgência</button><span className="muted" style={{ fontSize: 10, marginLeft: "auto" }}>{items.length} leads {usingRemote ? "persistidos" : "demo"}</span></div>
    <div className="kanban-shell"><div className="kanban-board">{stageOrder.map((stage) => { const columnItems = items.filter((contact) => contact.stage === stage); return <div className="kanban-column" key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingId) moveContact(draggingId, stage); setDraggingId(null); }}><div className="kanban-column-header"><strong>{stage}</strong><span>{columnItems.length.toString().padStart(2, "0")}</span></div>{columnItems.map((contact) => <article className="kanban-card" key={contact.id} draggable onDragStart={() => setDraggingId(contact.id)} onDragEnd={() => setDraggingId(null)}><div className="kanban-card-head"><div className="avatar">{contact.initials}</div><div><strong>{contact.name}</strong><small>{contact.service}</small></div></div><div className="kanban-card-body"><div className="kanban-meta"><span>Urgência</span><strong className={`urgency urgency-${contact.urgency.toLowerCase().replace("é", "e")}`}>{contact.urgency}</strong></div><div className="kanban-meta"><span>Local</span><strong>{contact.neighborhood}</strong></div><div className="kanban-meta"><span>Orçamento</span><strong>{formatCurrency(contact.quote)}</strong></div><div className="kanban-meta"><span>IA</span><strong className={contact.aiEnabled ? "green" : "amber"}>{contact.aiEnabled ? "Ativa" : "Pausada"}</strong></div><div className="kanban-meta"><span>Dias sem resposta</span><strong>{contact.daysNoReply}</strong></div></div><div style={{ marginTop: 11 }}><select className="select-control" value={contact.stage} onChange={(event) => moveContact(contact.id, event.target.value)} aria-label={`Estágio de ${contact.name}`}><option value={contact.stage}>{contact.stage}</option>{stageOrder.filter((item) => item !== contact.stage).map((item) => <option key={item}>{item}</option>)}</select></div></article>)}</div>; })}</div></div>
  </PanelLayout>;
}

export function AgendaPage() {
  const [view, setView] = useState(() => typeof window !== "undefined" && window.innerWidth < 800 ? "dia" : "semana");
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState("2026-09-26");
  const [time, setTime] = useState("17:30");
  const [contactId, setContactId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [notes, setNotes] = useState("");
  const agendaQuery = trpc.agenda.snapshot.useQuery();
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const createMutation = trpc.agenda.create.useMutation({ onSuccess: async () => { setShowForm(false); setNotes(""); await agendaQuery.refetch(); } });
  const days = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const serviceOptions = agendaQuery.data?.services ?? [];
  const professionalOptions = agendaQuery.data?.professionals ?? [];
  const workspaceTimezone = agendaQuery.data?.timezone ?? "America/Sao_Paulo";
  const localAppointments = appointments.map((item) => ({ id: item.id, contactName: getContact(item.contactId).name, service: item.service, date: item.date, time: item.time, duration: item.duration, status: item.status, notes: item.notes }));
  const remoteAppointments = (agendaQuery.data?.appointments ?? []).map((item) => { const startsAt = new Date(item.startsAt); const endsAt = new Date(item.endsAt); return { id: String(item.id), contactName: item.contactName ?? "Cliente sem nome", service: item.serviceName ?? "Atendimento", date: startsAt.toLocaleDateString("pt-BR", { timeZone: workspaceTimezone }), time: startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: workspaceTimezone }), duration: `${Math.max(15, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000))} min`, status: item.status === "confirmed" ? "Confirmado" : item.status === "requested" ? "Solicitado" : item.status === "completed" ? "Concluído" : item.status === "cancelled" ? "Cancelado" : "Não compareceu", notes: item.notes ?? "" }; });
  const agendaItems = remoteAppointments.length > 0 ? remoteAppointments : localAppointments;
  const submitAppointment = () => { const selectedService = serviceOptions.find((item) => String(item.id) === serviceId); const duration = selectedService?.durationMinutes ?? 60; const startsAt = new Date(`${date}T${time}:00`); const endsAt = new Date(startsAt.getTime() + duration * 60000); createMutation.mutate({ contactId: contactId ? Number(contactId) : undefined, serviceId: Number(serviceId || serviceOptions[0]?.id), professionalId: Number(professionalId || professionalOptions[0]?.id), startsAt, endsAt, notes: notes || undefined }); };
  return <PanelLayout eyebrow="Operação / Agenda" title="Agenda" description="Veja seus próximos atendimentos e disponibilidade." actions={<button className="btn-primary" onClick={() => setShowForm((value) => !value)}><Plus size={13} /> Novo agendamento</button>}>
    <DemoBanner />
    {showForm && <section className="surface appointment-form-panel"><SectionTitle eyebrow="Novo atendimento" title="Reservar horário" /><div className="form-grid"><div className="form-field"><label>Cliente</label><select className="select-control" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Cliente sem cadastro</option>{(contactsQuery.data ?? contacts).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></div><div className="form-field"><label>Serviço</label><select className="select-control" value={serviceId || String(serviceOptions[0]?.id ?? "")} onChange={(event) => setServiceId(event.target.value)}>{serviceOptions.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></div><div className="form-field"><label>Profissional</label><select className="select-control" value={professionalId || String(professionalOptions[0]?.id ?? "")} onChange={(event) => setProfessionalId(event.target.value)}>{professionalOptions.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></div><div className="form-field"><label>Data</label><input className="input-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="form-field"><label>Horário</label><input className="input-control" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div><div className="form-field full"><label>Observações</label><input className="input-control" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: confirmar pelo WhatsApp" /></div></div>{createMutation.error && <div className="demo-banner" style={{ marginTop: 15, marginBottom: 0 }}><Info size={14} /> {createMutation.error.message}</div>}<div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="btn-primary" disabled={createMutation.isPending || !serviceOptions.length || !professionalOptions.length} onClick={submitAppointment}>{createMutation.isPending ? "Salvando..." : "Reservar horário"}</button><button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button></div></section>}
    <div className="agenda-layout"><section className="surface calendar-panel"><div className="calendar-toolbar"><div><span className="eyebrow">Setembro 2026</span><strong>21 — 27 de setembro</strong></div><ViewToggle active={view} onChange={setView} /></div>{view === "dia" ? <div style={{ paddingTop: 18 }}><SectionTitle eyebrow="Sábado, 26 de setembro" title="Agenda do dia" />{agendaItems.filter((appointment) => appointment.date === "26/09/2026").length > 0 ? <div className="list-stack">{agendaItems.filter((appointment) => appointment.date === "26/09/2026").map((appointment) => <div className="appointment-row" key={appointment.id}><div className="time-block">{appointment.time}</div><div className="row-copy"><strong>{appointment.contactName}</strong><small>{appointment.service} · {appointment.duration}</small><small>{appointment.notes}</small></div><StatusBadge tone={appointment.status === "Confirmado" ? "green" : appointment.status === "Cancelado" ? "red" : "amber"}>{appointment.status}</StatusBadge></div>)}</div> : <EmptyState icon={CalendarCheck2} title="Nenhum horário neste dia" description="Crie um agendamento ou escolha outra data." />}</div> : <><div className="week-grid"><div></div>{days.map((day, index) => <div className="day-name" key={day}>{day}<strong>{21 + index}</strong></div>)}{["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"].map((item) => <div key={item} className="time-label">{item}</div>)}{Array.from({ length: 7 * 9 }).map((_, index) => { const day = index % 7; const timeIndex = Math.floor(index / 7); const event = (day === 3 && timeIndex === 5) ? agendaItems[0] : (day === 5 && timeIndex === 8) ? agendaItems[1] : null; return <div key={`${day}-${timeIndex}`} className={event ? "calendar-event" : ""}>{event && <><strong>{event.service}</strong><small>{event.time} · {event.contactName.split(" ")[0]}</small></>}</div>; })}</div></>}</section><aside className="surface side-list"><h3>Próximos agendamentos</h3>{agendaItems.map((appointment) => <div className="appointment-row" key={appointment.id}><div className="time-block">{appointment.date.slice(0, 5)}<small style={{ display: "block", marginTop: 4, color: "#555" }}>{appointment.time}</small></div><div className="row-copy"><strong>{appointment.contactName}</strong><small>{appointment.service} · {appointment.status}</small></div></div>)}<button className="btn-secondary" style={{ width: "100%", marginTop: 14 }} onClick={() => setView("dia")}>Ver agenda do dia</button></aside></div>
  </PanelLayout>;
}

export function ContactsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const items = contactsQuery.data ?? contacts;
  const filtered = items.filter((contact) => `${contact.name} ${contact.phone} ${contact.service}`.toLowerCase().includes(search.toLowerCase()));
  return <PanelLayout eyebrow="Clientes / CRM local" title="Contatos" description="Clientes e leads sincronizados com o atendimento." actions={<button className="btn-primary"><Plus size={13} /> Novo contato</button>}>
    <DemoBanner /><div className="filter-bar"><div className="search-field"><Search size={14} /><input className="input-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato, telefone ou serviço" /></div><button className="btn-secondary"><Filter size={13} /> Filtros</button></div><div className="surface data-table-wrap"><table className="data-table"><thead><tr><th>Contato</th><th>Serviço</th><th>Estágio</th><th>Urgência</th><th>IA</th><th>Atualização</th><th></th></tr></thead><tbody>{filtered.map((contact) => <tr key={contact.id} onClick={() => navigate(`/contacts/${contact.id}`)} style={{ cursor: "pointer" }}><td><div className="table-person"><div className="avatar">{contact.initials}</div><div>{contact.name}<span className="table-secondary">{contact.phone}</span></div></div></td><td>{contact.service}<span className="table-secondary">{contact.neighborhood}, {contact.city}</span></td><td><StatusBadge tone={contact.stage === "Agendado" ? "green" : contact.stage === "Sem retorno" ? "amber" : "blue"}>{contact.stage}</StatusBadge></td><td><span className={`urgency urgency-${contact.urgency.toLowerCase().replace("é", "e")}`}>{contact.urgency}</span></td><td className={contact.aiEnabled ? "green" : "amber"}>{contact.aiEnabled ? "Ativa" : "Pausada"}</td><td>{formatChatTime(contact.lastMessageAt)}</td><td><button className="icon-button"><ArrowUpRight size={14} /></button></td></tr>)}</tbody></table></div>
  </PanelLayout>;
}

export function ContactDetailPage() {
  const [, params] = useRoute("/contacts/:id");
  const detailId = Number(params?.id ?? 0);
  const detailInput = useMemo(() => ({ contactId: detailId }), [detailId]);
  const threadQuery = trpc.inbox.thread.useQuery(detailInput, { enabled: detailId > 0 });
  const contact = threadQuery.data?.contact ?? getContact(params?.id ?? "c1");
  const [tab, setTab] = useState("overview");
  const messages = threadQuery.data?.messages ?? messagesByContact[contact.id] ?? [];
  const audit = threadQuery.data?.audit ?? [];
  const agendaQuery = trpc.agenda.snapshot.useQuery();
  const contactAppointments = agendaQuery.data?.appointments.filter((appointment) => appointment.contactId === detailId) ?? [];
  return <PanelLayout eyebrow="Clientes / Ficha" title="Ficha do cliente" description="Histórico operacional, conversa e dados sincronizados." actions={<PageLink href="/contacts" className="btn-secondary"><ArrowDownRight size={13} /> Voltar para contatos</PageLink>}>
    <DemoBanner /><div className="detail-layout"><aside className="surface detail-nav">{[["overview", "Visão geral"], ["conversation", "Conversa"], ["appointments", "Agendamentos"], ["notes", "Notas internas"], ["history", "Histórico de eventos"]].map(([key, label]) => <button key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}</aside><section className="surface detail-card"><div className="detail-hero"><div className="detail-person"><div className="avatar">{contact.initials}</div><div><h2>{contact.name}</h2><p>{contact.phone} · {contact.city}, {contact.neighborhood}</p></div></div><div className="detail-actions"><button className="btn-secondary"><Phone size={13} /> Ligar</button><PageLink href={`/inbox`} className="btn-primary"><MessageCircle size={13} /> Abrir conversa</PageLink></div></div><div className="detail-stats"><div className="detail-stat"><span>Serviço solicitado</span><strong>{contact.service}</strong></div><div className="detail-stat"><span>Estágio atual</span><strong>{contact.stage}</strong></div><div className="detail-stat"><span>Orçamento</span><strong>{formatCurrency(contact.quote)}</strong></div><div className="detail-stat"><span>IA</span><strong className={contact.aiEnabled ? "green" : "amber"}>{contact.aiEnabled ? "Ativa" : "Pausada"}</strong></div></div>{tab === "overview" && <><SectionTitle eyebrow="Resumo" title="Dados do atendimento" /><div className="timeline"><div className="timeline-row"><div className="timeline-time">{formatChatTime(contact.lastMessageAt)}</div><div className="timeline-marker" /><div className="timeline-copy"><strong>Última mensagem registrada</strong><p>{contact.lastMessage}</p></div></div><div className="timeline-row"><div className="timeline-time">Hoje</div><div className="timeline-marker" /><div className="timeline-copy"><strong>Contato sincronizado</strong><p>Dados carregados da base persistente do Forte Panel.</p></div></div></div></>}{tab === "conversation" && <div className="chat-body" style={{ padding: "4px 0" }}>{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div>}{tab === "appointments" && <div className="list-stack">{contactAppointments.length > 0 ? contactAppointments.map((appointment) => { const startsAt = new Date(appointment.startsAt); const timezone = agendaQuery.data?.timezone ?? "America/Sao_Paulo"; return <div className="appointment-row" key={appointment.id}><div className="time-block">{startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</div><div className="row-copy"><strong>{appointment.serviceName ?? "Atendimento"}</strong><small>{startsAt.toLocaleDateString("pt-BR", { timeZone: timezone })} · {appointment.professionalName ?? "Profissional"}</small><small>{appointment.notes ?? "Sem observações"}</small></div><StatusBadge tone={appointment.status === "confirmed" ? "green" : appointment.status === "cancelled" ? "red" : "amber"}>{appointment.status === "confirmed" ? "Confirmado" : appointment.status === "requested" ? "Solicitado" : appointment.status}</StatusBadge></div>; }) : <EmptyState icon={CalendarCheck2} title="Nenhum agendamento para este contato" description="Reserve um horário pela Agenda para acompanhar o atendimento aqui." />}</div>}{tab === "notes" && <div><textarea className="textarea-control" placeholder="Escreva uma nota interna para este contato..." /><button className="btn-primary" style={{ marginTop: 10 }}>Salvar nota</button></div>}{tab === "history" && <div className="timeline">{audit.length > 0 ? audit.map((item) => <div className="timeline-row" key={item.id}><div className="timeline-time">{formatChatTime(item.createdAt.toISOString())}</div><div className="timeline-marker" /><div className="timeline-copy"><strong>{item.action}</strong><p>{item.summary}</p></div></div>) : <EmptyState icon={Clock3} title="Ainda sem eventos de auditoria" description="As próximas ações do operador aparecerão aqui." />}</div>}</section></div>
  </PanelLayout>;
}

export function BillingPage() {
  const [showForm, setShowForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localQuotes, setLocalQuotes] = useState(quotes);
  const totalQuoted = localQuotes.reduce((sum, quote) => sum + quote.quoted, 0);
  const totalReceived = localQuotes.reduce((sum, quote) => sum + quote.received, 0);
  return <PanelLayout eyebrow="Financeiro / Controle manual" title="Faturamento" description="Orçamentos e recebimentos, sem gateway de pagamento." actions={<button className="btn-primary" onClick={() => { setShowForm(true); setSaved(false); }}><Plus size={13} /> Novo orçamento</button>}>
    <DemoBanner /><div className="billing-summary"><div className="surface billing-card"><span>Total orçado</span><strong>{formatCurrency(totalQuoted)}</strong></div><div className="surface billing-card"><span>Total aprovado</span><strong className="blue">{formatCurrency(950)}</strong></div><div className="surface billing-card"><span>Recebido</span><strong className="green">{formatCurrency(totalReceived)}</strong></div><div className="surface billing-card"><span>Pendente</span><strong className="amber">{formatCurrency(totalQuoted - totalReceived)}</strong></div><div className="surface billing-card"><span>Em aberto</span><strong>{localQuotes.filter((quote) => quote.status !== "Pago").length.toString().padStart(2, "0")}</strong></div></div><div className="billing-layout"><section className="surface form-panel"><SectionTitle eyebrow="Registros recentes" title="Orçamentos" action={<select className="select-control" style={{ width: 145 }}><option>Setembro 2026</option><option>Agosto 2026</option></select>} />{localQuotes.map((quote) => { const contact = getContact(quote.contactId); return <div className="quote-row" key={quote.id}><div className="avatar">{contact.initials}</div><div className="row-copy"><strong>{contact.name}</strong><small>{quote.service} · {quote.description}</small><div style={{ marginTop: 7 }}><StatusBadge tone={quote.status === "Pago" ? "green" : quote.status === "Aprovado" ? "blue" : "amber"}>{quote.status}</StatusBadge></div></div><div className="quote-amount"><strong>{formatCurrency(quote.quoted)}</strong><small>Pendente {formatCurrency(quote.quoted - quote.received)}</small></div></div>; })}</section>{showForm ? <section className="surface form-panel"><SectionTitle eyebrow="Novo registro" title="Criar orçamento" /><div className="form-grid"><div className="form-field full"><label>Cliente</label><select className="select-control"><option>Selecione um contato</option>{contacts.map((contact) => <option key={contact.id}>{contact.name}</option>)}</select></div><div className="form-field"><label>Serviço</label><input className="input-control" placeholder="Ex.: Instalação" /></div><div className="form-field"><label>Valor do orçamento</label><input className="input-control" placeholder="R$ 0,00" /></div><div className="form-field full"><label>Descrição</label><textarea className="textarea-control" placeholder="Descreva o serviço e as condições..." /></div><div className="form-field"><label>Vencimento</label><input type="date" className="input-control" /></div><div className="form-field"><label>Status</label><select className="select-control"><option>Orçamento</option><option>Aguardando aprovação</option><option>Aprovado</option></select></div></div>{saved && <div className="demo-banner" style={{ marginTop: 15, marginBottom: 0 }}><CheckCircle2 size={14} /> Orçamento salvo localmente em modo demo.</div>}<div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="btn-primary" onClick={() => { setSaved(true); setShowForm(false); }}>Salvar orçamento</button><button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button></div></section> : <section className="surface form-panel"><EmptyState icon={WalletCards} title="Controle financeiro manual" description="Registre orçamento, recebimento e pendência sem processar pagamentos reais." /><button className="btn-secondary" style={{ width: "100%", marginTop: 13 }} onClick={() => setShowForm(true)}><Plus size={13} /> Adicionar registro</button></section>}</div>
  </PanelLayout>;
}

export function IntegrationsPage() {
  const channelsQuery = trpc.workspace.channels.useQuery();
  const defaultChannelQuery = trpc.workspace.defaultChannel.useQuery();
  const utils = trpc.useUtils();
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const setDefaultMutation = trpc.workspace.setDefaultChannel.useMutation({ onSuccess: async () => { await Promise.all([defaultChannelQuery.refetch(), channelsQuery.refetch()]); setSavingProvider(null); }, onError: () => setSavingProvider(null) });
  const channels = channelsQuery.data ?? [];
  const providerLabel = (provider: string) => provider === "meta_cloud_api" ? "WhatsApp Cloud API oficial" : "PAPI · WhatsApp conectado";
  return <PanelLayout eyebrow="Sistema / Conectividade" title="Integrações" description="Escolha o canal de WhatsApp e acompanhe as conexões externas do painel."><DemoBanner /><section className="surface channel-selector-panel"><SectionTitle eyebrow="Canal de atendimento" title="WhatsApp padrão" action={<StatusBadge tone="green">{providerLabel(defaultChannelQuery.data ?? "papi")}</StatusBadge>} /><p className="muted channel-selector-copy">O CRM pode operar com PAPI, com a API oficial da Meta ou com os dois. A escolha abaixo será usada quando uma mensagem não informar um provedor específico.</p><div className="channel-grid">{channels.map((channel) => { const selected = defaultChannelQuery.data === channel.provider; return <button type="button" key={channel.id} className={`channel-option ${selected ? "is-selected" : ""}`} onClick={() => { setSavingProvider(channel.provider); setDefaultMutation.mutate({ provider: channel.provider as "papi" | "meta_cloud_api" }); }}><div className="channel-option-top"><div className="integration-icon"><MessageCircle size={16} /></div><StatusBadge tone={selected ? "green" : "neutral"}>{selected ? "Padrão" : "Disponível"}</StatusBadge></div><strong>{providerLabel(channel.provider)}</strong><small>{channel.provider === "meta_cloud_api" ? "Token e Phone Number ID da Meta ficam apenas no servidor." : "Canal conectado pela API Pastorini, isolado por adapter."}</small>{savingProvider === channel.provider && <span className="channel-saving">Salvando seleção...</span>}</button>; })}</div></section><div className="integration-grid">{integrations.map((integration) => { const tone = integration.status === "connected" ? "green" : integration.status === "pending" ? "amber" : "red"; const Icon = integration.key === "papi" ? MessageCircle : integration.key === "n8n" ? Sparkles : integration.key === "crm" ? ContactRoundIcon : CalendarCheck2; return <article className="surface surface-hover integration-card" key={integration.key}><div className="integration-top"><div className="integration-name"><div className="integration-icon"><Icon size={16} /></div><div><strong>{integration.name}</strong><small>{integration.description}</small></div></div><StatusBadge tone={tone}>{integration.status === "connected" ? "Conectado" : integration.status === "pending" ? "Pendente" : "Desconectado"}</StatusBadge></div><p>{integration.detail}</p><div className="integration-footer"><small>Última verificação: agora</small><button className="btn-secondary"><Settings2 size={12} /> Configurar</button></div></article>; })}</div><div style={{ marginTop: 28 }}><SectionTitle eyebrow="Proteções ativas" title="Modo demo" /><div className="surface" style={{ padding: 20, display: "grid", gap: 14 }}><div className="profile-field"><span><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 8 }} />PAPI real</span><strong className="green">Bloqueada</strong></div><div className="profile-field"><span><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 8 }} />Meta Cloud API real</span><strong className="green">Bloqueada</strong></div><div className="profile-field"><span><ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: 8 }} />n8n real</span><strong className="green">Bloqueado</strong></div></div></div></PanelLayout>;
}

function ContactRoundIcon({ size }: { size?: number }) { return <UsersRound size={size} />; }

export function SettingsPage() {
  return <PanelLayout eyebrow="Sistema / Preferências" title="Configurações" description="Preferências do painel e do usuário administrador."><div className="detail-layout"><aside className="surface detail-nav"><button className="is-active">Perfil e conta</button><button>Notificações</button><button>Segurança</button><button>Auditoria</button></aside><section className="surface detail-card"><SectionTitle eyebrow="Perfil do operador" title="Gabriel Barbosa" /><div className="form-grid"><div className="form-field"><label>Nome completo</label><input className="input-control" defaultValue="Gabriel Barbosa" /></div><div className="form-field"><label>E-mail</label><input className="input-control" defaultValue="gabriel@fortepanel.demo" /></div><div className="form-field"><label>Telefone</label><input className="input-control" defaultValue="(11) 99999-0000" /></div><div className="form-field"><label>Fuso horário</label><select className="select-control"><option>America/Sao_Paulo</option></select></div></div><button className="btn-primary" style={{ marginTop: 18 }}>Salvar alterações</button><div style={{ marginTop: 34 }}><SectionTitle eyebrow="Sessão atual" title="Acesso protegido" /><div className="surface" style={{ padding: 15, background: "rgba(255,255,255,.018)" }}><div className="profile-field"><span>Ambiente</span><strong className="amber">DEMO_MODE=true</strong></div><div className="profile-field" style={{ marginTop: 12 }}><span>Último acesso</span><strong>Agora · navegador atual</strong></div></div></div></section></div></PanelLayout>;
}

export function NotFoundPage() {
  return <PanelLayout eyebrow="Sistema" title="Página não encontrada" description="A rota informada ainda não existe neste MVP."><EmptyState icon={Search} title="Nada por aqui" description="Use a navegação lateral para voltar à operação." /><div style={{ marginTop: 15, textAlign: "center" }}><PageLink href="/dashboard" className="btn-primary">Voltar ao dashboard</PageLink></div></PanelLayout>;
}


export function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const workspaceQuery = trpc.workspace.current.useQuery();
  const membersQuery = trpc.workspace.members.useQuery();
  const members = membersQuery.data?.length ? membersQuery.data : [{ id: 0, name: "Gabriel Barbosa", email: "gabriel@fortepanel.demo", role: "owner" as const, active: true }];
  const roleLabels: Record<string, string> = { owner: "Proprietário", admin: "Administrador", manager: "Gerente", agent: "Atendente" };
  return <PanelLayout eyebrow="Sistema / Acessos" title="Equipe" description="Controle quem atende, gerencia e administra este workspace." actions={<button className="btn-primary" onClick={() => setShowInvite((value) => !value)}><Plus size={13} /> Convidar membro</button>}>
    <div className="team-summary-grid">
      <div className="surface stat-card"><span className="stat-label">Workspace</span><strong className="team-summary-value">{workspaceQuery.data?.name ?? "Forte Serviços Demo"}</strong><span className="stat-foot">Plano {workspaceQuery.data?.plan ?? "pro"}</span></div>
      <div className="surface stat-card"><span className="stat-label">Membros ativos</span><strong className="stat-value">{members.filter((member) => member.active).length.toString().padStart(2, "0")}</strong><span className="stat-foot">Acessos autorizados</span></div>
      <div className="surface stat-card"><span className="stat-label">Papéis</span><strong className="stat-value">04</strong><span className="stat-foot">Proprietário, admin, gerente e atendente</span></div>
    </div>
    {showInvite && <section className="surface team-invite-panel"><SectionTitle eyebrow="Novo acesso" title="Convidar para a equipe" /><div className="form-grid"><div className="form-field"><label>Nome</label><input className="input-control" placeholder="Nome do colaborador" /></div><div className="form-field"><label>E-mail</label><input className="input-control" placeholder="colaborador@empresa.com" type="email" /></div><div className="form-field"><label>Papel</label><select className="select-control"><option value="agent">Atendente</option><option value="manager">Gerente</option><option value="admin">Administrador</option></select></div></div><div className="demo-banner" style={{ marginTop: 15, marginBottom: 0 }}><Info size={14} /> O convite será enviado pelo fluxo de autenticação quando o canal de e-mail estiver habilitado.</div></section>}
    <section className="surface team-table-card"><SectionTitle eyebrow="Acessos do workspace" title="Membros da equipe" action={<StatusBadge tone="green">Workspace ativo</StatusBadge>} /><div className="team-table">{members.map((member) => <div className="team-row" key={member.id}><div className="avatar">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="row-copy"><strong>{member.name}</strong><small>{member.email}</small></div><span className="team-role">{roleLabels[member.role] ?? member.role}</span><StatusBadge tone={member.active ? "green" : "neutral"}>{member.active ? "Ativo" : "Pendente"}</StatusBadge><button className="icon-button" aria-label={`Editar ${member.name}`}><Settings2 size={14} /></button></div>)}</div></section>
    <section className="surface permission-card"><SectionTitle eyebrow="Matriz de acesso" title="Permissões por papel" /><div className="permission-grid"><div><strong>Proprietário</strong><small>Todos os módulos, faturamento e equipe.</small></div><div><strong>Administrador</strong><small>Operação, integrações e configurações.</small></div><div><strong>Gerente</strong><small>Inbox, funil, agenda e relatórios.</small></div><div><strong>Atendente</strong><small>Inbox, contatos e tarefas atribuídas.</small></div></div></section>
  </PanelLayout>;
}
