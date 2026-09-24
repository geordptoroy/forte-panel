import { useMemo, useState } from "react";
import { CheckCircle2, Info, Plus, WalletCards } from "lucide-react";
import PanelLayout, { EmptyState, SectionTitle, StatusBadge } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = {
  orcamento: "Orçamento",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  sinal_pendente: "Sinal pendente",
  parcialmente_pago: "Parcialmente pago",
  pago: "Pago",
  cancelado: "Cancelado",
};

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BillingPage() {
  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [quotedValue, setQuotedValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const quotesQuery = trpc.billing.quotes.useQuery();
  const contactsQuery = trpc.inbox.contacts.useQuery();
  const utils = trpc.useUtils();
  const createMutation = trpc.billing.createQuote.useMutation({ onSuccess: async () => { setShowForm(false); setServiceName(""); setDescription(""); setQuotedValue(""); setDueDate(""); await utils.billing.quotes.invalidate(); } });
  const items = quotesQuery.data ?? [];
  const totals = useMemo(() => items.reduce((acc, item) => ({ quoted: acc.quoted + item.quotedCents, received: acc.received + item.receivedCents, open: acc.open + (item.status !== "pago" && item.status !== "cancelado" ? 1 : 0) }), { quoted: 0, received: 0, open: 0 }), [items]);
  const submit = () => {
    const cents = Math.round(Number(quotedValue.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0 || !contactId || !serviceName.trim()) return;
    createMutation.mutate({ contactId: Number(contactId), serviceName: serviceName.trim(), description: description.trim() || undefined, quotedCents: cents, dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : undefined, status: "orcamento" });
  };

  return <PanelLayout eyebrow="Financeiro / Controle manual" title="Faturamento" description="Orçamentos e recebimentos persistidos, sem gateway de pagamento." actions={<button className="btn-primary" onClick={() => setShowForm((current) => !current)}><Plus size={13} /> Novo orçamento</button>}>
    <div className="billing-summary"><div className="surface billing-card"><span>Total orçado</span><strong>{money(totals.quoted)}</strong></div><div className="surface billing-card"><span>Recebido</span><strong className="green">{money(totals.received)}</strong></div><div className="surface billing-card"><span>Pendente</span><strong className="amber">{money(totals.quoted - totals.received)}</strong></div><div className="surface billing-card"><span>Em aberto</span><strong>{String(totals.open).padStart(2, "0")}</strong></div></div>
    <div className="billing-layout"><section className="surface form-panel"><SectionTitle eyebrow="Registros persistidos" title="Orçamentos" />{items.length === 0 ? <EmptyState icon={WalletCards} title="Nenhum orçamento cadastrado" description="Crie o primeiro orçamento ligado a um contato do CRM." /> : items.map((quote) => <div className="quote-row" key={quote.id}><div className="avatar">{quote.contactInitials}</div><div className="row-copy"><strong>{quote.contactName}</strong><small>{quote.serviceName} · {quote.description || "Sem descrição"}</small><div style={{ marginTop: 7 }}><StatusBadge tone={quote.status === "pago" ? "green" : quote.status === "cancelado" ? "red" : quote.status === "aprovado" ? "blue" : "amber"}>{statusLabels[quote.status] ?? quote.status}</StatusBadge></div></div><div className="quote-amount"><strong>{money(quote.quotedCents)}</strong><small>Recebido {money(quote.receivedCents)}</small></div></div>)}</section>{showForm ? <section className="surface form-panel"><SectionTitle eyebrow="Novo registro" title="Criar orçamento" /><div className="form-grid"><div className="form-field full"><label htmlFor="quote-contact">Cliente</label><select id="quote-contact" className="select-control" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Selecione um contato</option>{(contactsQuery.data ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.phone}</option>)}</select></div><div className="form-field"><label htmlFor="quote-service">Serviço</label><input id="quote-service" className="input-control" value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Ex.: Instalação" /></div><div className="form-field"><label htmlFor="quote-value">Valor do orçamento</label><input id="quote-value" className="input-control" inputMode="decimal" value={quotedValue} onChange={(event) => setQuotedValue(event.target.value)} placeholder="0,00" /></div><div className="form-field full"><label htmlFor="quote-description">Descrição</label><textarea id="quote-description" className="textarea-control" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Condições, materiais e escopo" /></div><div className="form-field"><label htmlFor="quote-due">Vencimento</label><input id="quote-due" type="date" className="input-control" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div>{createMutation.error && <div className="demo-banner" style={{ marginTop: 15, marginBottom: 0 }}><Info size={14} /> {createMutation.error.message}</div>}<div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="btn-primary" disabled={createMutation.isPending || !contactId || !serviceName.trim()} onClick={submit}>{createMutation.isPending ? "Salvando..." : "Salvar orçamento"}</button><button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button></div></section> : <section className="surface form-panel"><EmptyState icon={CheckCircle2} title="Controle financeiro manual" description="Registre orçamento, recebimento e pendência sem processar pagamentos reais." /><button className="btn-secondary" style={{ width: "100%", marginTop: 13 }} onClick={() => setShowForm(true)}><Plus size={13} /> Adicionar registro</button></section>}</div>
  </PanelLayout>;
}
