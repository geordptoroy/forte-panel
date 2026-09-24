import { useState } from "react";
import { Plus, Settings2, ShieldCheck } from "lucide-react";
import PanelLayout, { EmptyState, SectionTitle, StatusBadge } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const roleLabels: Record<string, string> = { owner: "Proprietário", admin: "Administrador", manager: "Gerente", agent: "Atendente" };
const operationalLabels: Record<string, string> = { human_attendant: "Atendente humano", ai_attendant: "Atendente IA", professional: "Profissional executor" };

type MemberForm = {
  name: string;
  email: string;
  password: string;
  role: "owner" | "admin" | "manager" | "agent";
  operationalRole: "human_attendant" | "ai_attendant" | "professional";
  professionalId: string;
};

const emptyForm: MemberForm = { name: "", email: "", password: "", role: "agent", operationalRole: "human_attendant", professionalId: "" };

/**
 * Team screen: creates real local accounts (email + password), links an access
 * to a professional and lets administrators activate or deactivate people.
 */
export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: "owner" | "admin" | "manager" | "agent"; operationalRole: "human_attendant" | "ai_attendant" | "professional"; professionalId: string } | null>(null);
  const workspaceQuery = trpc.workspace.current.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const membersQuery = trpc.workspace.members.useQuery();
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery(undefined, { enabled: Boolean(accessQuery.data?.canManageCatalog) });
  const utils = trpc.useUtils();
  const canManageTeam = accessQuery.data?.canManageTeam ?? false;
  const members = membersQuery.data ?? [];
  const professionals = professionalsQuery.data ?? [];

  const createMember = trpc.workspace.createMember.useMutation({
    onSuccess: async () => {
      setShowInvite(false);
      setForm(emptyForm);
      await utils.workspace.members.invalidate();
      toast.success("Acesso criado com sucesso");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMember = trpc.workspace.updateMember.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      setEditDraft(null);
      await utils.workspace.members.invalidate();
      toast.success("Acesso atualizado");
    },
    onError: (error) => toast.error(error.message),
  });

  const requiresProfessional = form.operationalRole === "professional";
  const canSubmit = form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 8 && (!requiresProfessional || Boolean(form.professionalId));

  return <PanelLayout
    eyebrow="Sistema / Acessos"
    title="Equipe"
    description="Controle quem atende, quem executa os serviços e quem administra este workspace."
    actions={canManageTeam ? <button className="btn-primary" onClick={() => setShowInvite((value) => !value)}><Plus size={13} /> Criar acesso</button> : undefined}
  >
    <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
      <div className="surface stat-card"><span className="stat-label">Workspace</span><strong className="team-summary-value">{workspaceQuery.data?.name ?? "Carregando..."}</strong><span className="stat-foot">Plano {workspaceQuery.data?.plan ?? "—"}</span></div>
      <div className="surface stat-card"><span className="stat-label">Membros ativos</span><strong className="stat-value">{String(members.filter((member) => member.active).length).padStart(2, "0")}</strong><span className="stat-foot">Acessos autorizados</span></div>
      <div className="surface stat-card"><span className="stat-label">Profissionais cadastrados</span><strong className="stat-value">{String(professionals.length).padStart(2, "0")}</strong><span className="stat-foot">Executores do catálogo</span></div>
    </div>

    {showInvite && canManageTeam && <section className="surface team-invite-panel">
      <SectionTitle eyebrow="Novo acesso" title="Criar acesso operacional" />
      <div className="form-grid">
        <div className="form-field"><label>Nome</label><input className="input-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do colaborador" /></div>
        <div className="form-field"><label>E-mail</label><input className="input-control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="colaborador@empresa.com" /></div>
        <div className="form-field"><label>Senha inicial</label><input className="input-control" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="mínimo 8 caracteres" /></div>
        <div className="form-field"><label>Perfil operacional</label>
          <select className="select-control" value={form.operationalRole} onChange={(event) => setForm({ ...form, operationalRole: event.target.value as MemberForm["operationalRole"], professionalId: event.target.value === "professional" ? form.professionalId : "" })}>
            <option value="human_attendant">Atendente humano</option>
            <option value="ai_attendant">Atendente IA</option>
            <option value="professional">Profissional executor</option>
          </select>
        </div>
        <div className="form-field"><label>Papel administrativo</label>
          <select className="select-control" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as MemberForm["role"] })}>
            <option value="agent">Atendente</option>
            <option value="manager">Gerente</option>
            <option value="admin">Administrador</option>
            <option value="owner">Proprietário</option>
          </select>
        </div>
        {requiresProfessional && <div className="form-field"><label>Profissional vinculado</label>
          <select className="select-control" value={form.professionalId} onChange={(event) => setForm({ ...form, professionalId: event.target.value })}>
            <option value="">Selecione</option>
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
          </select>
        </div>}
      </div>
      {requiresProfessional && professionals.length === 0 && <div className="demo-banner" style={{ marginTop: 14, marginBottom: 0 }}><ShieldCheck size={14} /> Cadastre um profissional antes de criar um acesso de executor.</div>}
      <div className="form-actions">
        <button className="btn-primary" disabled={createMember.isPending || !canSubmit} onClick={() => createMember.mutate({ name: form.name, email: form.email, password: form.password, role: form.role, operationalRole: form.operationalRole, professionalId: form.professionalId ? Number(form.professionalId) : undefined })}>{createMember.isPending ? "Criando..." : "Criar acesso"}</button>
        <button className="btn-secondary" onClick={() => { setShowInvite(false); setForm(emptyForm); }}>Cancelar</button>
      </div>
    </section>}

    <section className="surface team-table-card">
      <SectionTitle eyebrow="Acessos do workspace" title="Membros da equipe" action={<StatusBadge tone="green">{members.filter((member) => member.active).length} ativos</StatusBadge>} />
      {members.length === 0
        ? <EmptyState icon={ShieldCheck} title="Nenhum membro ainda" description="Crie o primeiro acesso para a equipe começar a operar." />
        : <div className="team-table">{members.map((member) => <div className="team-row" key={member.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="avatar">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div className="row-copy" style={{ minWidth: 220 }}>
            <strong>{member.name}</strong>
            <small>{member.email}</small>
            <small>{operationalLabels[member.operationalRole] ?? member.operationalRole}{member.professionalName ? ` · ${member.professionalName}` : ""}</small>
          </div>
          <span className="team-role">{roleLabels[member.role] ?? member.role}</span>
          <StatusBadge tone={member.active ? "green" : "neutral"}>{member.active ? "Ativo" : "Desativado"}</StatusBadge>
          {canManageTeam && editingId === member.id && editDraft
            ? <div className="row-copy" style={{ minWidth: 250 }}>
              <select className="select-control" value={editDraft.role} onChange={(event) => setEditDraft({ ...editDraft, role: event.target.value as typeof editDraft.role })}>
                <option value="owner">Proprietário</option>
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="agent">Atendente</option>
              </select>
              <select className="select-control" style={{ marginTop: 8 }} value={editDraft.operationalRole} onChange={(event) => setEditDraft({ ...editDraft, operationalRole: event.target.value as typeof editDraft.operationalRole })}>
                <option value="human_attendant">Atendente humano</option>
                <option value="ai_attendant">Atendente IA</option>
                <option value="professional">Profissional executor</option>
              </select>
              {editDraft.operationalRole === "professional" && <select className="select-control" style={{ marginTop: 8 }} value={editDraft.professionalId} onChange={(event) => setEditDraft({ ...editDraft, professionalId: event.target.value })}>
                <option value="">Selecione o profissional</option>
                {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
              </select>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn-primary" disabled={updateMember.isPending} onClick={() => updateMember.mutate({
                  memberId: member.id,
                  role: editDraft.role,
                  operationalRole: editDraft.operationalRole,
                  professionalId: editDraft.operationalRole === "professional" && editDraft.professionalId ? Number(editDraft.professionalId) : null,
                })}>Salvar</button>
                <button className="btn-secondary" onClick={() => { setEditingId(null); setEditDraft(null); }}>Cancelar</button>
                <button className="btn-ghost" disabled={updateMember.isPending} onClick={() => updateMember.mutate({ memberId: member.id, active: !member.active })}>{member.active ? "Desativar acesso" : "Reativar acesso"}</button>
              </div>
            </div>
            : canManageTeam && <button className="icon-button" aria-label={`Editar ${member.name}`} onClick={() => {
              setEditingId(member.id);
              setEditDraft({ role: member.role, operationalRole: member.operationalRole, professionalId: member.professionalId ? String(member.professionalId) : "" });
            }}><Settings2 size={14} /></button>}
        </div>)}</div>}
    </section>

    <section className="surface permission-card">
      <SectionTitle eyebrow="Matriz de acesso" title="Permissões por papel" />
      <div className="permission-grid">
        <div><strong>Proprietário</strong><small>Todos os módulos, faturamento, equipe e auditoria.</small></div>
        <div><strong>Administrador</strong><small>Operação, integrações, equipe e configurações.</small></div>
        <div><strong>Gerente</strong><small>Inbox, funil, agenda completa, catálogo e auditoria.</small></div>
        <div><strong>Atendente</strong><small>Inbox, contatos, kanban e tarefas atribuídas.</small></div>
        <div><strong>Profissional executor</strong><small>Apenas a própria agenda, clientes atribuídos e disponibilidade.</small></div>
      </div>
    </section>
  </PanelLayout>;
}
