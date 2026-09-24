import { useEffect, useMemo, useState } from "react";
import { Clock3, DollarSign, Plus, ScissorsIcon, Sparkles, UserCog, Users } from "lucide-react";
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
const formatCurrency = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Administrative catalog screen: services, professionals, links and weekly availability. */
export function ServicesPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("0");
  const [linkDraft, setLinkDraft] = useState<Record<number, number[]>>({});
  const servicesQuery = trpc.workspace.services.useQuery();
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const utils = trpc.useUtils();
  const services = servicesQuery.data ?? [];
  const professionals = professionalsQuery.data ?? [];
  const canManage = accessQuery.data?.canManageCatalog ?? false;

  useEffect(() => {
    if (!servicesQuery.data) return;
    setLinkDraft((current) => {
      const next = { ...current };
      for (const service of servicesQuery.data) next[service.id] = service.professionalIds;
      return next;
    });
  }, [servicesQuery.data]);

  const createService = trpc.workspace.createService.useMutation({
    onSuccess: async () => {
      setName(""); setDescription(""); setDuration("60"); setPrice("0"); setShowForm(false);
      await utils.workspace.services.invalidate();
      toast.success("Serviço cadastrado");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateService = trpc.workspace.updateService.useMutation({
    onSuccess: async () => { await utils.workspace.services.invalidate(); toast.success("Serviço atualizado"); },
    onError: (error) => toast.error(error.message),
  });
  const setServiceProfessionals = trpc.workspace.setServiceProfessionals.useMutation({
    onSuccess: async () => { await utils.workspace.services.invalidate(); await utils.workspace.professionalsDetailed.invalidate(); toast.success("Vínculo atualizado"); },
    onError: (error) => toast.error(error.message),
  });

  const totals = useMemo(() => ({
    active: services.filter((service) => service.active).length,
    inactive: services.filter((service) => !service.active).length,
    linkedProfessionals: new Set(services.flatMap((service) => service.professionalIds)).size,
  }), [services]);

  const submit = () => {
    const durationMinutes = Number(duration);
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    createService.mutate({ name, description: description || undefined, durationMinutes: Number.isFinite(durationMinutes) && durationMinutes >= 5 ? durationMinutes : 60, priceCents: Number.isFinite(priceCents) && priceCents >= 0 ? priceCents : 0 });
  };

  return <PanelLayout
    eyebrow="Configuração / Catálogo"
    title="Serviços"
    description="Cadastre os serviços executáveis, a duração e quem pode realizá-los."
    actions={canManage ? <button className="btn-primary" onClick={() => setShowForm((value) => !value)}><Plus size={13} /> Novo serviço</button> : undefined}
  >
    <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
      <div className="surface stat-card"><span className="stat-label">Serviços ativos</span><strong className="stat-value">{String(totals.active).padStart(2, "0")}</strong><span className="stat-foot">Disponíveis para agendamento</span></div>
      <div className="surface stat-card"><span className="stat-label">Inativos</span><strong className="stat-value">{String(totals.inactive).padStart(2, "0")}</strong><span className="stat-foot">Fora da agenda e da IA</span></div>
      <div className="surface stat-card"><span className="stat-label">Profissionais vinculados</span><strong className="stat-value">{String(totals.linkedProfessionals).padStart(2, "0")}</strong><span className="stat-foot">Executores com serviço atribuído</span></div>
    </div>

    {showForm && <section className="surface team-invite-panel">
      <SectionTitle eyebrow="Novo serviço" title="Cadastrar serviço" />
      <div className="form-grid">
        <div className="form-field"><label>Nome</label><input className="input-control" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Instalação de chuveiro" /></div>
        <div className="form-field"><label>Duração (min)</label><input className="input-control" type="number" min={5} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} /></div>
        <div className="form-field full"><label>Descrição</label><input className="input-control" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="O que está incluído no serviço" /></div>
        <div className="form-field"><label>Preço (R$)</label><input className="input-control" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" /></div>
      </div>
      <div className="form-actions">
        <button className="btn-primary" disabled={createService.isPending || name.trim().length < 2} onClick={submit}>{createService.isPending ? "Salvando..." : "Salvar serviço"}</button>
        <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
      </div>
    </section>}

    {services.length === 0
      ? <EmptyState icon={ScissorsIcon} title="Nenhum serviço cadastrado" description="Cadastre o primeiro serviço para a IA conseguir consultar horários reais." />
      : <section className="surface team-table-card">
        <SectionTitle eyebrow="Catálogo operacional" title="Serviços do workspace" action={<StatusBadge tone={totals.active > 0 ? "green" : "amber"}>{totals.active} ativos</StatusBadge>} />
        <div className="team-table">{services.map((service) => {
          const draft = linkDraft[service.id] ?? service.professionalIds;
          return <div className="team-row" key={service.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="row-copy" style={{ minWidth: 220 }}>
              <strong>{service.name}</strong>
              <small>{service.description ?? "Sem descrição"}</small>
              <small style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <span><Clock3 size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{service.durationMinutes} min</span>
                <span><DollarSign size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{service.priceCents === 0 ? "Sem preço" : formatCurrency(service.priceCents)}</span>
              </small>
            </div>
            <div className="row-copy" style={{ minWidth: 220 }}>
              <small style={{ marginBottom: 6 }}>Profissionais executores</small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {professionals.length === 0
                  ? <small className="muted">Cadastre um profissional primeiro</small>
                  : professionals.map((professional) => <label key={professional.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "#a9a9a9" }}>
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={draft.includes(professional.id)}
                      onChange={(event) => setLinkDraft((current) => {
                        const previous = current[service.id] ?? service.professionalIds;
                        const next = event.target.checked ? [...previous, professional.id] : previous.filter((id) => id !== professional.id);
                        return { ...current, [service.id]: next };
                      })}
                    />
                    {professional.name}{professional.active ? "" : " (inativo)"}
                  </label>)}
              </div>
              {canManage && <button className="btn-secondary" style={{ marginTop: 9 }} disabled={setServiceProfessionals.isPending} onClick={() => setServiceProfessionals.mutate({ serviceId: service.id, professionalIds: draft })}><Users size={12} /> Salvar vínculos</button>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <StatusBadge tone={service.active ? "green" : "neutral"}>{service.active ? "Ativo" : "Inativo"}</StatusBadge>
              {canManage && <button className="btn-ghost" disabled={updateService.isPending} onClick={() => updateService.mutate({ serviceId: service.id, active: !service.active })}>{service.active ? "Desativar" : "Reativar"}</button>}
            </div>
          </div>;
        })}</div>
      </section>}
  </PanelLayout>;
}

/** Administrative screen for professionals, their services and weekly availability. */
export function ProfessionalsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", specialty: "", color: "#56d68a" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityEntry[]>([]);
  const [servicesDraft, setServicesDraft] = useState<number[]>([]);
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery();
  const servicesQuery = trpc.workspace.services.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const utils = trpc.useUtils();
  const professionals = professionalsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const canManage = accessQuery.data?.canManageCatalog ?? false;
  const selected = professionals.find((professional) => professional.id === selectedId) ?? professionals[0];

  useEffect(() => {
    if (!selected) return;
    setAvailabilityDraft(selected.availability.map((entry) => ({ ...entry })));
    setServicesDraft(selected.serviceIds);
  }, [selected?.id, selected?.availability, selected?.serviceIds]);

  const createProfessional = trpc.workspace.createProfessional.useMutation({
    onSuccess: async (professional) => {
      setForm({ name: "", specialty: "", color: "#56d68a" });
      setShowForm(false);
      await utils.workspace.professionalsDetailed.invalidate();
      await utils.workspace.professionals.invalidate();
      setSelectedId(professional.id);
      toast.success("Profissional cadastrado");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateProfessional = trpc.workspace.updateProfessional.useMutation({
    onSuccess: async () => { await utils.workspace.professionalsDetailed.invalidate(); toast.success("Profissional atualizado"); },
    onError: (error) => toast.error(error.message),
  });
  const setProfessionalServices = trpc.workspace.setProfessionalServices.useMutation({
    onSuccess: async () => { await utils.workspace.professionalsDetailed.invalidate(); await utils.workspace.services.invalidate(); toast.success("Serviços vinculados"); },
    onError: (error) => toast.error(error.message),
  });
  const setProfessionalAvailability = trpc.workspace.setProfessionalAvailability.useMutation({
    onSuccess: async () => { await utils.workspace.professionalsDetailed.invalidate(); toast.success("Disponibilidade salva"); },
    onError: (error) => toast.error(error.message),
  });

  return <PanelLayout
    eyebrow="Configuração / Equipe executora"
    title="Profissionais"
    description="Cadastre quem executa o serviço, os serviços que cada um realiza e os horários de trabalho."
    actions={canManage ? <button className="btn-primary" onClick={() => setShowForm((value) => !value)}><Plus size={13} /> Novo profissional</button> : undefined}
  >
    {showForm && <section className="surface team-invite-panel">
      <SectionTitle eyebrow="Novo executor" title="Cadastrar profissional" />
      <div className="form-grid">
        <div className="form-field"><label>Nome</label><input className="input-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Gabriel Ferreira" /></div>
        <div className="form-field"><label>Especialidade</label><input className="input-control" value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} placeholder="Ex.: Eletricista" /></div>
        <div className="form-field"><label>Cor na agenda</label><input className="input-control" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div>
      </div>
      <div className="form-actions">
        <button className="btn-primary" disabled={createProfessional.isPending || form.name.trim().length < 2} onClick={() => createProfessional.mutate({ name: form.name, specialty: form.specialty || undefined, color: form.color })}>{createProfessional.isPending ? "Salvando..." : "Salvar profissional"}</button>
        <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
      </div>
    </section>}

    {professionals.length === 0
      ? <EmptyState icon={UserCog} title="Nenhum profissional cadastrado" description="Cadastre o profissional executor antes de criar o login vinculado." />
      : <div className="detail-layout">
        <aside className="surface detail-nav">
          {professionals.map((professional) => <button key={professional.id} className={selected?.id === professional.id ? "is-active" : ""} onClick={() => setSelectedId(professional.id)}>
            {professional.name}{professional.active ? "" : " · inativo"}
          </button>)}
        </aside>
        {selected && <section className="surface detail-card">
          <SectionTitle
            eyebrow="Ficha do executor"
            title={selected.name}
            action={<StatusBadge tone={selected.active ? "green" : "neutral"}>{selected.active ? "Ativo" : "Inativo"}</StatusBadge>}
          />
          <div className="detail-stats">
            <div className="detail-stat"><span>Especialidade</span><strong>{selected.specialty ?? "Não informada"}</strong></div>
            <div className="detail-stat"><span>Serviços vinculados</span><strong>{selected.serviceIds.length}</strong></div>
            <div className="detail-stat"><span>Faixas semanais</span><strong>{selected.availability.length}</strong></div>
            <div className="detail-stat"><span>Logins vinculados</span><strong>{selected.linkedMembers.length}</strong></div>
          </div>

          <SectionTitle eyebrow="Vínculo" title="Serviços que este profissional executa" />
          {services.length === 0
            ? <EmptyState icon={Sparkles} title="Sem serviços cadastrados" description="Cadastre serviços na tela de Serviços para poder vinculá-los." />
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              {services.map((service) => <label key={service.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 9px", border: "1px solid var(--line)", fontSize: 10, color: "#a9a9a9" }}>
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={servicesDraft.includes(service.id)}
                  onChange={(event) => setServicesDraft((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))}
                />
                {service.name}
              </label>)}
            </div>}
          {canManage && <button className="btn-secondary" disabled={setProfessionalServices.isPending} onClick={() => setProfessionalServices.mutate({ professionalId: selected.id, serviceIds: servicesDraft })}><Users size={12} /> Salvar serviços</button>}

          <div style={{ marginTop: 30 }}>
            <SectionTitle eyebrow="Jornada" title="Disponibilidade semanal" />
            <div className="team-table">{weekdays.map((day) => {
              const entry = availabilityDraft.find((item) => item.weekday === day.value);
              return <div className="team-row" key={day.value}>
                <div className="time-block" style={{ width: 52 }}>{day.short}</div>
                <div className="row-copy">
                  <small>{day.label}</small>
                  {entry
                    ? <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <input className="input-control" style={{ maxWidth: 110 }} type="time" value={minuteToTime(entry.startMinute)} onChange={(event) => setAvailabilityDraft((current) => current.map((item) => item.weekday === day.value ? { ...item, startMinute: timeToMinute(event.target.value) } : item))} />
                      <span className="muted" style={{ fontSize: 10 }}>até</span>
                      <input className="input-control" style={{ maxWidth: 110 }} type="time" value={minuteToTime(entry.endMinute)} onChange={(event) => setAvailabilityDraft((current) => current.map((item) => item.weekday === day.value ? { ...item, endMinute: timeToMinute(event.target.value) } : item))} />
                    </div>
                    : <small className="muted" style={{ marginTop: 4, display: "block" }}>Não trabalha neste dia</small>}
                </div>
                {canManage && <button className="btn-ghost" onClick={() => setAvailabilityDraft((current) => entry ? current.filter((item) => item.weekday !== day.value) : [...current, { weekday: day.value, startMinute: 9 * 60, endMinute: 18 * 60 }])}>{entry ? "Remover" : "Adicionar"}</button>}
              </div>;
            })}</div>
            {canManage && <button className="btn-primary" style={{ marginTop: 14 }} disabled={setProfessionalAvailability.isPending} onClick={() => setProfessionalAvailability.mutate({ professionalId: selected.id, entries: availabilityDraft })}>{setProfessionalAvailability.isPending ? "Salvando..." : "Salvar disponibilidade"}</button>}
          </div>

          {canManage && <div style={{ marginTop: 30 }}>
            <SectionTitle eyebrow="Situação" title="Ativação do profissional" />
            <button className="btn-secondary" disabled={updateProfessional.isPending} onClick={() => updateProfessional.mutate({ professionalId: selected.id, active: !selected.active })}>{selected.active ? "Desativar profissional" : "Reativar profissional"}</button>
          </div>}
        </section>}
      </div>}
  </PanelLayout>;
}
