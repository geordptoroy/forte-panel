from pathlib import Path

path = Path('/home/ubuntu/forte-panel/client/src/pages/PanelPages.tsx')
text = path.read_text()
text = text.replace(
    '  const audit = threadQuery.data?.audit ?? [];\n  return <PanelLayout',
    '  const audit = threadQuery.data?.audit ?? [];\n  const agendaQuery = trpc.agenda.snapshot.useQuery();\n  const contactAppointments = agendaQuery.data?.appointments.filter((appointment) => appointment.contactId === detailId) ?? [];\n  return <PanelLayout'
)
text = text.replace(
    '{tab === "appointments" && <div className="list-stack"><EmptyState icon={CalendarCheck2} title="Nenhum agendamento persistido" description="A agenda será conectada à mesma ficha na próxima etapa." /></div>}',
    '{tab === "appointments" && <div className="list-stack">{contactAppointments.length > 0 ? contactAppointments.map((appointment) => { const startsAt = new Date(appointment.startsAt); const timezone = agendaQuery.data?.timezone ?? "America/Sao_Paulo"; return <div className="appointment-row" key={appointment.id}><div className="time-block">{startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</div><div className="row-copy"><strong>{appointment.serviceName ?? "Atendimento"}</strong><small>{startsAt.toLocaleDateString("pt-BR", { timeZone: timezone })} · {appointment.professionalName ?? "Profissional"}</small><small>{appointment.notes ?? "Sem observações"}</small></div><StatusBadge tone={appointment.status === "confirmed" ? "green" : appointment.status === "cancelled" ? "red" : "amber"}>{appointment.status === "confirmed" ? "Confirmado" : appointment.status === "requested" ? "Solicitado" : appointment.status}</StatusBadge></div>; }) : <EmptyState icon={CalendarCheck2} title="Nenhum agendamento para este contato" description="Reserve um horário pela Agenda para acompanhar o atendimento aqui." />}</div>}'
)
path.write_text(text)
