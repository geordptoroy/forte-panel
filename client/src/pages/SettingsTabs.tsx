import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Clock3, KeyRound, Plus, ScrollText, ShieldCheck, Trash2, UserRound } from "lucide-react";
import PanelLayout, { EmptyState, SectionTitle, StatusBadge } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const weekdays = [
  { value: 0, label: "Domingo", short: "DOM" },
  { value: 1, label: "Segunda", short: "SEG" },
  { value: 2, label: "Terça", short: "TER" },
  { value: 3, label: "Quarta", short: "QUA" },
  { value: 4, label: "Quinta", short: "QUI" },
  { value: 5, label: "Sexta", short: "SEX" },
  { value: 6, label: "Sábado", short: "SÁB" },
];

type AvailabilityEntry = { weekday: number; startMinute: number; endMinute: number };
const minuteToTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const timeToMinute = (value: string) => {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

/**
 * Settings screen with real tabs. Every tab performs a persisted action: the
 * demo placeholders that only showed alerts were removed on purpose.
 */
export function SettingsTabsPage() {
  const accessQuery = trpc.auth.access.useQuery();
  const access = accessQuery.data;
  const isProfessional = Boolean(access?.professionalId) && access?.operationalRole === "professional";
  const tabs = useMemo(() => {
    const list = [
      { key: "profile", label: "Perfil e conta" },
      { key: "security", label: "Segurança" },
    ];
    if (access?.canSeeFullAgenda) list.push({ key: "notifications", label: "Notificações" });
    if (isProfessional) list.splice(1, 0, { key: "availability", label: "Minha disponibilidade" });
    if (access?.canSeeFullAgenda) list.push({ key: "audit", label: "Auditoria" });
    if (access?.canManageTeam) list.push({ key: "development", label: "Limpeza de desenvolvimento" });
    return list;
  }, [access?.canSeeFullAgenda, isProfessional]);
  const [tab, setTab] = useState("profile");

  useEffect(() => {
    if (!tabs.some((item) => item.key === tab)) setTab("profile");
  }, [tabs, tab]);

  return <PanelLayout eyebrow="Sistema / Preferências" title="Configurações" description="Conta, segurança, notificações e — para profissionais executores — a própria disponibilidade.">
    <div className="detail-layout">
      <aside className="surface detail-nav">
        {tabs.map((item) => <button key={item.key} className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)}>{item.label}</button>)}
      </aside>
      <section className="surface detail-card">
        {tab === "profile" && <ProfileTab />}
        {tab === "security" && <SecurityTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "availability" && <AvailabilityTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "development" && <DevelopmentTab />}
      </section>
    </div>
  </PanelLayout>;
}

function ProfileTab() {
  const userQuery = trpc.auth.me.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  useEffect(() => {
    if (!userQuery.data) return;
    setForm({ name: userQuery.data.name ?? "", email: userQuery.data.email ?? "", phone: userQuery.data.phone ?? "" });
  }, [userQuery.data]);
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.auth.me.invalidate(), utils.auth.access.invalidate()]);
      toast.success("Perfil atualizado");
    },
    onError: (error) => toast.error(error.message),
  });
  return <div>
    <SectionTitle eyebrow="Perfil do operador" title={form.name || "Operador"} action={<StatusBadge tone="green">{accessQuery.data?.role ?? "agent"}</StatusBadge>} />
    <div className="form-grid">
      <div className="form-field"><label>Nome completo</label><input className="input-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
      <div className="form-field"><label>E-mail</label><input className="input-control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
      <div className="form-field"><label>Telefone</label><input className="input-control" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Não informado" /></div>
      <div className="form-field"><label>Perfil operacional</label><input className="input-control" value={accessQuery.data?.operationalRole ?? "human_attendant"} readOnly /></div>
      <div className="form-field"><label>Profissional vinculado</label><input className="input-control" value={accessQuery.data?.professionalName ?? "Nenhum"} readOnly /></div>
    </div>
    <button className="btn-primary" style={{ marginTop: 18 }} disabled={updateProfile.isPending || form.name.trim().length < 2 || !form.email} onClick={() => updateProfile.mutate({ name: form.name, email: form.email, phone: form.phone || undefined })}>{updateProfile.isPending ? "Salvando..." : "Salvar alterações"}</button>
  </div>;
}

function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword(""); setNewPassword(""); setConfirm("");
      toast.success("Senha atualizada");
    },
    onError: (error) => toast.error(error.message),
  });
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  return <div>
    <SectionTitle eyebrow="Credenciais" title="Trocar senha" action={<StatusBadge tone="green">Sessão protegida</StatusBadge>} />
    <div className="form-grid">
      <div className="form-field full"><label>Senha atual</label><input className="input-control" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></div>
      <div className="form-field"><label>Nova senha</label><input className="input-control" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="mínimo 8 caracteres" /></div>
      <div className="form-field"><label>Confirmar nova senha</label><input className="input-control" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></div>
    </div>
    {mismatch && <div className="form-error">As senhas não coincidem.</div>}
    <button className="btn-primary" style={{ marginTop: 18 }} disabled={changePassword.isPending || newPassword.length < 8 || mismatch} onClick={() => changePassword.mutate({ currentPassword, newPassword })}><KeyRound size={13} /> {changePassword.isPending ? "Salvando..." : "Atualizar senha"}</button>
    <div style={{ marginTop: 30 }}>
      <SectionTitle eyebrow="Sessão atual" title="Acesso protegido" />
      <div style={{ padding: 15, background: "rgba(255,255,255,.018)", border: "1px solid var(--line)" }}>
        <div className="profile-field"><span>Proteção</span><strong className="green"><ShieldCheck size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />Senha local com derivação scrypt</strong></div>
        <div className="profile-field" style={{ marginTop: 12 }}><span>Escopo</span><strong className="green">Somente este workspace</strong></div>
      </div>
    </div>
  </div>;
}

function NotificationsTab() {
  const preferencesQuery = trpc.workspace.notifyPreferences.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<{ newLead: boolean; appointmentCreated: boolean; appointmentConfirmed: boolean; dailySummary: boolean } | null>(null);
  useEffect(() => { if (preferencesQuery.data) setDraft(preferencesQuery.data); }, [preferencesQuery.data]);
  const save = trpc.workspace.saveNotifyPreferences.useMutation({
    onSuccess: async () => { await utils.workspace.notifyPreferences.invalidate(); toast.success("Preferências salvas"); },
    onError: (error) => toast.error(error.message),
  });
  if (!draft) return <EmptyState icon={Bell} title="Carregando preferências" description="Buscando as preferências persistidas deste workspace." />;
  const items: { key: keyof typeof draft; label: string; description: string }[] = [
    { key: "newLead", label: "Novo lead", description: "Avisar a equipe quando um novo contato chegar pelo Inbox." },
    { key: "appointmentCreated", label: "Agendamento criado", description: "Avisar gestores e o profissional responsável ao reservar um horário." },
    { key: "appointmentConfirmed", label: "Agendamento confirmado", description: "Avisar gestores e o profissional quando o status mudar para confirmado." },
    { key: "dailySummary", label: "Resumo diário", description: "Mostrar aos gestores um resumo do dia às 18h no fuso do workspace." },
  ];
  return <div>
    <SectionTitle eyebrow="Alertas no painel" title="Preferências de notificação" />
    <div className="team-table">{items.map((item) => <div className="team-row" key={item.key}>
      <div className="row-copy"><strong>{item.label}</strong><small>{item.description}</small></div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10, color: "#a9a9a9" }}>
        <input type="checkbox" checked={draft[item.key]} onChange={(event) => setDraft({ ...draft, [item.key]: event.target.checked })} />
        {draft[item.key] ? "Ativado" : "Desativado"}
      </label>
    </div>)}</div>
    <button className="btn-primary" style={{ marginTop: 16 }} disabled={save.isPending} onClick={() => save.mutate(draft)}>{save.isPending ? "Salvando..." : "Salvar preferências"}</button>
  </div>;
}

function AvailabilityTab() {
  const availabilityQuery = trpc.professional.myAvailability.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<AvailabilityEntry[]>([]);
  useEffect(() => {
    if (!availabilityQuery.data || !availabilityQuery.data.linked) return;
    setDraft(availabilityQuery.data.entries.map((entry) => ({ ...entry })));
  }, [availabilityQuery.data]);
  const save = trpc.professional.updateMyAvailability.useMutation({
    onSuccess: async () => { await utils.professional.myAvailability.invalidate(); toast.success("Disponibilidade atualizada"); },
    onError: (error) => toast.error(error.message),
  });
  if (!availabilityQuery.data) return <EmptyState icon={Clock3} title="Carregando disponibilidade" description="Buscando sua jornada de trabalho." />;
  if (!availabilityQuery.data.linked) return <EmptyState icon={Clock3} title="Sem profissional vinculado" description="Peça ao administrador para vincular seu acesso a um profissional." />;
  return <div>
    <SectionTitle eyebrow="Jornada" title="Minha disponibilidade semanal" action={<StatusBadge tone="green">{draft.length} faixas</StatusBadge>} />
    <div className="team-table">{weekdays.map((day) => {
      const entry = draft.find((item) => item.weekday === day.value);
      return <div className="team-row" key={day.value}>
        <div className="time-block" style={{ width: 52 }}>{day.short}</div>
        <div className="row-copy">
          <small>{day.label}</small>
          {entry
            ? <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <input className="input-control" style={{ maxWidth: 110 }} type="time" value={minuteToTime(entry.startMinute)} onChange={(event) => setDraft((current) => current.map((item) => item.weekday === day.value ? { ...item, startMinute: timeToMinute(event.target.value) } : item))} />
              <span className="muted" style={{ fontSize: 10 }}>até</span>
              <input className="input-control" style={{ maxWidth: 110 }} type="time" value={minuteToTime(entry.endMinute)} onChange={(event) => setDraft((current) => current.map((item) => item.weekday === day.value ? { ...item, endMinute: timeToMinute(event.target.value) } : item))} />
            </div>
            : <small className="muted" style={{ display: "block", marginTop: 4 }}>Sem atendimento neste dia</small>}
        </div>
        <button className="btn-ghost" onClick={() => setDraft((current) => entry ? current.filter((item) => item.weekday !== day.value) : [...current, { weekday: day.value, startMinute: 9 * 60, endMinute: 18 * 60 }])}>{entry ? "Remover" : <><Plus size={12} /> Adicionar</>}</button>
      </div>;
    })}</div>
    <button className="btn-primary" style={{ marginTop: 16 }} disabled={save.isPending} onClick={() => save.mutate({ entries: draft })}>{save.isPending ? "Salvando..." : "Salvar disponibilidade"}</button>
  </div>;
}

function AuditTab() {
  const auditQuery = trpc.workspace.audit.useQuery({ limit: 60 });
  const rows = auditQuery.data ?? [];
  if (!rows.length) return <EmptyState icon={ScrollText} title="Ainda sem eventos de auditoria" description="Criação de contas, mudanças de senha e alterações de agenda aparecerão aqui." />;
  return <div>
    <SectionTitle eyebrow="Rastreabilidade" title="Auditoria do workspace" action={<StatusBadge tone="green">{rows.length} eventos</StatusBadge>} />
    <div className="team-table">{rows.map((row) => <div className="team-row" key={row.id}>
      <div className="row-copy">
        <strong>{row.action}</strong>
        <small>{row.summary}</small>
      </div>
      <div className="row-copy" style={{ textAlign: "right", minWidth: 160 }}>
        <small>{row.actorName ?? "Sistema"}</small>
        <small>{new Date(row.createdAt).toLocaleString("pt-BR")}</small>
      </div>
    </div>)}</div>
  </div>;
}

function DevelopmentTab() {
  const [confirmation, setConfirmation] = useState("");
  const reset = trpc.development.resetWorkspace.useMutation({
    onSuccess: () => { setConfirmation(""); toast.success("Dados do Forte Panel apagados. Usuários e acesso foram preservados."); },
    onError: (error) => toast.error(error.message),
  });
  const phrase = "APAGAR DADOS DO FORTE PANEL";
  return <div>
    <SectionTitle eyebrow="Somente desenvolvimento" title="Limpar dados do Forte Panel" action={<StatusBadge tone="red">Ação destrutiva</StatusBadge>} />
    <div className="demo-banner" style={{ marginBottom: 18 }}><AlertTriangle size={15} /><span>Isso apaga contatos, conversas, mensagens, agenda, serviços, profissionais, notas, eventos, configurações do agente e canais do Forte Panel.</span></div>
    <p className="muted">O usuário administrador e o workspace permanecem para você entrar novamente. O botão só funciona quando você digitar exatamente:</p>
    <code style={{ display: "block", padding: 12, margin: "12px 0", background: "rgba(255,255,255,.04)" }}>{phrase}</code>
    <input className="input-control" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={phrase} />
    <button className="btn-primary" style={{ marginTop: 16, background: "#8f3030" }} disabled={reset.isPending || confirmation !== phrase} onClick={() => { if (window.confirm("Confirma apagar todos os dados de desenvolvimento do Forte Panel?")) reset.mutate({ confirmation: phrase }); }}><Trash2 size={13} /> {reset.isPending ? "Apagando..." : "Apagar dados do Forte Panel"}</button>
  </div>;
}

export { UserRound };
