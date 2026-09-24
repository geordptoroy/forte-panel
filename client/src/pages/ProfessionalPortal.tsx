import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Clock3, MapPin, Phone, PlayCircle, UserRound, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import PanelLayout, { EmptyState, PageLink, SectionTitle, StatusBadge } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type PortalAppointment = {
  id: number;
  contactId: number | null;
  serviceId: number;
  professionalId: number;
  startsAt: string;
  endsAt: string;
  status: "requested" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  serviceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactCity: string | null;
  contactNeighborhood: string | null;
};

const statusLabels: Record<string, string> = {
  requested: "Solicitado",
  confirmed: "Confirmado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const statusTone = (status: string) => status === "confirmed" ? "green" : status === "completed" ? "neutral" : status === "cancelled" ? "red" : status === "in_progress" ? "blue" : "amber";

function formatTime(value: string, timezone: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
}

function formatDate(value: string, timezone: string) {
  return new Date(value).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: timezone });
}

function dayKey(value: string, timezone: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: timezone });
}

/**
 * Professional portal: the agenda is filtered on the server by the
 * professionalId linked to the logged user, so nothing from other executors
 * ever reaches this screen.
 */
export function ProfessionalPortalPage() {
  const [location, navigate] = useLocation();
  const requestedView = new URLSearchParams(location.split("?")[1] ?? "").get("view");
  const [view, setView] = useState<"dia" | "semana" | "mes" | "clientes">("dia");
  const agendaQuery = trpc.professional.myAgenda.useQuery();
  const utils = trpc.useUtils();
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    if (requestedView && ["dia", "semana", "mes", "clientes"].includes(requestedView)) setView(requestedView as typeof view);
  }, [requestedView]);

  const transition = trpc.agenda.updateMyStatus.useMutation({
    onSuccess: async (result) => {
      setPendingId(null);
      await utils.professional.myAgenda.invalidate();
      toast.success(`Atendimento ${statusLabels[result.status] ?? result.status}`);
    },
    onError: (error) => {
      setPendingId(null);
      toast.error(error.message);
    },
  });

  const data = agendaQuery.data;
  if (agendaQuery.isLoading) {
    return <PanelLayout eyebrow="Minha operação" title="Meu trabalho" description="Carregando sua agenda atribuída.">
      <EmptyState icon={ClipboardList} title="Carregando agenda" description="Buscando os atendimentos vinculados ao seu acesso." />
    </PanelLayout>;
  }
  if (!data || !data.linked) {
    return <PanelLayout eyebrow="Minha operação" title="Meu trabalho" description="Sua agenda pessoal de atendimentos.">
      <EmptyState icon={UserRound} title="Acesso sem profissional vinculado" description="Seu usuário ainda não está ligado a um profissional executor. Peça ao proprietário para vincular no cadastro da equipe." />
      <div style={{ marginTop: 14 }}><PageLink href="/settings" className="btn-secondary">Abrir configurações</PageLink></div>
    </PanelLayout>;
  }

  const timezone = data.timezone;
  const next = data.nextAppointment;
  const update = (id: number, status: "confirmed" | "in_progress" | "completed" | "no_show") => {
    setPendingId(id);
    transition.mutate({ id, status });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PortalAppointment[]>();
    for (const appointment of data.week) {
      const key = dayKey(appointment.startsAt, timezone);
      map.set(key, [...(map.get(key) ?? []), appointment as PortalAppointment]);
    }
    return Array.from(map.entries());
  }, [data.week, timezone]);

  const monthGrouped = useMemo(() => {
    const map = new Map<string, PortalAppointment[]>();
    for (const appointment of data.month) {
      const key = dayKey(appointment.startsAt, timezone);
      map.set(key, [...(map.get(key) ?? []), appointment as PortalAppointment]);
    }
    return Array.from(map.entries());
  }, [data.month, timezone]);

  return <PanelLayout
    eyebrow="Minha operação"
    title="Meu trabalho"
    description={`Agenda filtrada pelo seu vínculo profissional${data.professionalName ? ` · ${data.professionalName}` : ""}.`}
    actions={<div className="view-toggle">
      {(["dia", "semana", "mes", "clientes"] as const).map((item) => <button key={item} className={view === item ? "is-active" : ""} onClick={() => { setView(item); navigate(`/my-work?view=${item}`, { replace: true }); }}>{item}</button>)}
    </div>}
  >
    <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
      <div className="surface stat-card"><span className="stat-label">Hoje</span><strong className="stat-value">{String(data.todayCount).padStart(2, "0")}</strong><span className="stat-foot">Atendimentos do dia</span></div>
      <div className="surface stat-card"><span className="stat-label">Nesta semana</span><strong className="stat-value">{String(data.weekCount).padStart(2, "0")}</strong><span className="stat-foot">Segunda a domingo</span></div>
      <div className="surface stat-card"><span className="stat-label">No mês</span><strong className="stat-value">{String(data.monthCount).padStart(2, "0")}</strong><span className="stat-foot">Agenda do mês corrente</span></div>
      <div className="surface stat-card"><span className="stat-label">Concluídos no mês</span><strong className="stat-value">{String(data.completedCount).padStart(2, "0")}</strong><span className="stat-foot">{data.pendingCount} ainda pendentes</span></div>
    </div>

    <section className="surface form-panel" style={{ marginBottom: 20 }}>
      <SectionTitle eyebrow="Próximo compromisso" title={next ? `${next.contactName ?? "Cliente não informado"} · ${formatTime(next.startsAt, timezone)}` : "Agenda livre"} action={next ? <StatusBadge tone={statusTone(next.status)}>{statusLabels[next.status]}</StatusBadge> : undefined} />
      {next
        ? <div className="appointment-row" style={{ borderBottom: 0 }}>
          <div className="time-block">{formatTime(next.startsAt, timezone)}<small style={{ display: "block", marginTop: 4 }}>{formatDate(next.startsAt, timezone)}</small></div>
          <div className="row-copy">
            <strong>{next.serviceName ?? `Atendimento #${next.id}`}</strong>
            <small><Phone size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />{next.contactPhone ?? "Telefone não informado"} · <MapPin size={10} style={{ verticalAlign: "middle", margin: "0 4px" }} />{[next.contactNeighborhood, next.contactCity].filter(Boolean).join(", ") || "Local não informado"}</small>
            <small>{next.notes ?? "Sem observações"}</small>
          </div>
          <div className="row-actions">
            {next.status !== "in_progress" && next.status !== "completed" && <button className="btn-secondary" disabled={pendingId === next.id} onClick={() => update(next.id, "in_progress")}><PlayCircle size={12} /> Iniciar</button>}
            <button className="btn-secondary" disabled={pendingId === next.id} onClick={() => update(next.id, "completed")}><CheckCircle2 size={12} /> Concluir</button>
            <button className="btn-ghost" disabled={pendingId === next.id} onClick={() => update(next.id, "no_show")}><XCircle size={12} /> Não compareceu</button>
          </div>
        </div>
        : <EmptyState icon={CalendarClock} title="Nenhum atendimento agendado" description="Quando a agenda reservar um horário para você, ele aparecerá aqui." />}
    </section>

    {view === "dia" && <section className="surface team-table-card">
      <SectionTitle eyebrow="Hoje" title={`${data.today.length} atendimento${data.today.length === 1 ? "" : "s"}`} action={<StatusBadge tone="green">Fuso {timezone}</StatusBadge>} />
      <div className="team-table">{data.today.length
        ? (data.today as PortalAppointment[]).map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} pendingId={pendingId} onUpdate={update} />)
        : <EmptyState icon={CalendarDays} title="Dia sem atendimentos" description="Aproveite para revisar a semana ou a visão mensal." />}</div>
    </section>}

    {view === "semana" && <section className="surface team-table-card">
      <SectionTitle eyebrow="Semana corrente" title={`${data.weekCount} atendimentos planejados`} />
      {grouped.length === 0
        ? <EmptyState icon={CalendarDays} title="Semana sem atendimentos" description="Nenhum horário reservado para esta semana." />
        : grouped.map(([day, items]) => <div key={day} style={{ marginBottom: 18 }}>
          <div className="nav-group-label" style={{ marginBottom: 8 }}>{day}</div>
          <div className="team-table">{items.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} pendingId={pendingId} onUpdate={update} />)}</div>
        </div>)}
    </section>}

    {view === "mes" && <section className="surface team-table-card">
      <SectionTitle eyebrow="Mês corrente" title={`${data.monthCount} atendimentos no mês`} />
      {monthGrouped.length === 0
        ? <EmptyState icon={CalendarDays} title="Mês sem atendimentos" description="Nenhum horário reservado para este mês." />
        : monthGrouped.map(([day, items]) => <div key={day} style={{ marginBottom: 18 }}>
          <div className="nav-group-label" style={{ marginBottom: 8 }}>{day} · {items.length} atendimento{items.length === 1 ? "" : "s"}</div>
          <div className="team-table">{items.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} pendingId={pendingId} onUpdate={update} />)}</div>
        </div>)}
    </section>}

    {view === "clientes" && <section className="surface team-table-card">
      <SectionTitle eyebrow="Clientes dos meus atendimentos" title={`${data.clients.length} clientes`} />
      {data.clients.length === 0
        ? <EmptyState icon={UserRound} title="Nenhum cliente vinculado" description="Os clientes aparecem aqui quando houver atendimentos atribuídos a você." />
        : <div className="team-table">{data.clients.map((client) => <div className="team-row" key={client.id}>
          <div className="avatar">{client.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div className="row-copy">
            <strong>{client.name}</strong>
            <small><Phone size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />{client.phone || "Telefone não informado"} · {[client.neighborhood, client.city].filter(Boolean).join(", ") || "Local não informado"}</small>
          </div>
          <div className="row-copy" style={{ textAlign: "right", minWidth: 150 }}>
            <small>Último atendimento</small>
            <small>{formatDate(client.lastAppointmentAt, timezone)} · {formatTime(client.lastAppointmentAt, timezone)}</small>
          </div>
        </div>)}</div>}
    </section>}
  </PanelLayout>;
}

function AppointmentRow({ appointment, timezone, pendingId, onUpdate }: {
  appointment: PortalAppointment;
  timezone: string;
  pendingId: number | null;
  onUpdate: (id: number, status: "confirmed" | "in_progress" | "completed" | "no_show") => void;
}) {
  const busy = pendingId === appointment.id;
  return <div className="team-row">
    <div className="time-block">{formatTime(appointment.startsAt, timezone)}<small style={{ display: "block", marginTop: 4 }}>{formatDate(appointment.startsAt, timezone)}</small></div>
    <div className="row-copy">
      <strong>{appointment.contactName ?? "Cliente não informado"}</strong>
      <small>{appointment.serviceName ?? `Atendimento #${appointment.id}`}{appointment.contactPhone ? ` · ${appointment.contactPhone}` : ""}</small>
      <small>{[appointment.contactNeighborhood, appointment.contactCity].filter(Boolean).join(", ") || "Local não informado"}</small>
      {appointment.notes && <small>{appointment.notes}</small>}
      <div className="row-actions" style={{ marginTop: 8 }}>
        <StatusBadge tone={statusTone(appointment.status)}>{statusLabels[appointment.status]}</StatusBadge>
        {appointment.status !== "completed" && <button className="btn-secondary" disabled={busy} onClick={() => onUpdate(appointment.id, "in_progress")}><PlayCircle size={12} /> Iniciar</button>}
        {appointment.status !== "completed" && <button className="btn-secondary" disabled={busy} onClick={() => onUpdate(appointment.id, "completed")}><CheckCircle2 size={12} /> Concluir</button>}
        {appointment.status !== "no_show" && appointment.status !== "completed" && <button className="btn-ghost" disabled={busy} onClick={() => onUpdate(appointment.id, "no_show")}><XCircle size={12} /> Não compareceu</button>}
        {appointment.contactId && <PageLink href={`/contacts/${appointment.contactId}`} className="btn-ghost"><UserRound size={12} /> Ficha do cliente</PageLink>}
      </div>
    </div>
  </div>;
}

export { Clock3 };
