import { useState } from "react";
import { Copy, Plus, Settings2, ShieldCheck, UserPlus, X } from "lucide-react";
import PanelLayout, { EmptyState, SectionTitle, StatusBadge } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const roleLabels: Record<string, string> = { owner: "Proprietário", admin: "Administrador", manager: "Gerente", agent: "Atendente" };
const operationalLabels: Record<string, string> = { human_attendant: "Atendente humano", ai_attendant: "Atendente IA", professional: "Profissional executor" };

type MemberForm = {
  name: string;
  email: string;
  role: "admin" | "manager" | "agent";
  operationalRole: "human_attendant" | "ai_attendant" | "professional";
  professionalId: string;
};

const emptyForm: MemberForm = { name: "", email: "", role: "agent", operationalRole: "human_attendant", professionalId: "" };

/**
 * Team screen: creates real local accounts (email + password), links an access
 * to a professional and lets administrators activate or deactivate people.
 */
export default function TeamPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: "owner" | "admin" | "manager" | "agent"; operationalRole: "human_attendant" | "ai_attendant" | "professional"; professionalId: string } | null>(null);
  const workspaceQuery = trpc.workspace.current.useQuery();
  const accessQuery = trpc.auth.access.useQuery();
  const membersQuery = trpc.workspace.members.useQuery();
  const invitesQuery = trpc.workspace.invites.list.useQuery();
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery(undefined, { enabled: Boolean(accessQuery.data?.canManageCatalog) });
  const utils = trpc.useUtils();
  const canManageTeam = accessQuery.data?.canManageTeam ?? false;
  const members = membersQuery.data ?? [];
  const professionals = professionalsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  const createInvite = trpc.workspace.invites.create.useMutation({
    onSuccess: async (result) => {
      setForm(emptyForm);
      const link = `${window.location.origin}/invite/${result.token}`;
      setInviteLink(link);
      try { await navigator.clipboard.writeText(link); } catch { /* manual copy remains available */ }
      await utils.workspace.invites.list.invalidate();
      toast.success("Convite criado. Copie o link para enviar ao funcionário.");
    },
    onError: (error) => toast.error(error.message),
  });
  const revokeInvite = trpc.workspace.invites.revoke.useMutation({
    onSuccess: async () => {
      await utils.workspace.invites.list.invalidate();
      toast.success("Convite revogado");
    },
    onError: error => toast.error(error.message),
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
  const canSubmit = form.name.trim().length >= 2 && form.email.includes("@") && (!requiresProfessional || Boolean(form.professionalId));

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
      <SectionTitle eyebrow="Novo convite" title="Enviar convite para funcionário" />
      <div className="form-grid">
        <div className="form-field"><label>Nome</label><input className="input-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome do colaborador" /></div>
        <div className="form-field"><label>E-mail</label><input className="input-control" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="colaborador@empresa.com" /></div>
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
          </select>
        </div>
        {requiresProfessional && <div className="form-field"><label>Profissional vinculado</label>
          <select className="select-control" value={form.professionalId} onChange={(event) => setForm({ ...form, professionalId: event.target.value })}>
            <option value="">Selecione</option>
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
          </select>
        </div>}
      </div>
      <small className="auth-footnote" style={{ display: "block", marginTop: 12 }}>O funcionário criará a própria senha ao aceitar o link. O envio automático de e-mail ainda está desativado.</small>
      {requiresProfessional && professionals.length === 0 && <div className="demo-banner" style={{ marginTop: 14, marginBottom: 0 }}><ShieldCheck size={14} /> Cadastre um profissional antes de criar um acesso de executor.</div>}
      <div className="form-actions">
        <button className="btn-primary" disabled={createInvite.isPending || !canSubmit} onClick={() => createInvite.mutate({ email: form.email, inviteeName: form.name, role: form.role, operationalRole: form.operationalRole, professionalId: form.professionalId ? Number(form.professionalId) : undefined })}><UserPlus size={14} /> {createInvite.isPending ? "Criando convite..." : "Criar convite"}</button>
        <button className="btn-secondary" onClick={() => { setShowInvite(false); setForm(emptyForm); }}>Cancelar</button>
      </div>
    </section>}

    {inviteLink && <section className="surface team-invite-panel">
      <SectionTitle eyebrow="Link criado" title="Envie este convite manualmente" />
      <p className="auth-footnote">O link foi copiado quando possível. Ele é individual e expira; não publique em grupo.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="input-control" value={inviteLink} readOnly aria-label="Link do convite" />
        <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Link copiado"); }}><Copy size={14} /> Copiar</button>
        <button className="btn-ghost" aria-label="Fechar link" onClick={() => setInviteLink(null)}><X size={14} /></button>
      </div>
    </section>}

    <section className="surface team-table-card">
      <SectionTitle eyebrow="Convites" title="Convites enviados" action={<StatusBadge tone="neutral">{invites.filter(invite => invite.status === "pending" || invite.status === "sent").length} pendentes</StatusBadge>} />
      {invites.length === 0 ? <p className="auth-footnote">Nenhum convite enviado ainda.</p> : <div className="team-table">{invites.slice(0, 12).map(invite => <div className="team-row" key={invite.id}>
        <div className="avatar">{invite.email.slice(0, 2).toUpperCase()}</div>
        <div className="row-copy" style={{ minWidth: 220 }}><strong>{invite.inviteeName || invite.email}</strong><small>{invite.email}</small><small>{roleLabels[invite.role] ?? invite.role} · {operationalLabels[invite.operationalRole] ?? invite.operationalRole}</small></div>
        <StatusBadge tone={invite.status === "accepted" ? "green" : invite.status === "pending" || invite.status === "sent" ? "amber" : "neutral"}>{invite.status}</StatusBadge>
        {(invite.status === "pending" || invite.status === "sent") && <button className="btn-ghost" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate({ inviteId: invite.id })}>Revogar</button>}
      </div>)}</div>}
    </section>

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
