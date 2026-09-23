from pathlib import Path

path = Path('/home/ubuntu/forte-panel/client/src/pages/PanelPages.tsx')
text = path.read_text()
start = text.index('export function ContactsPage() {')
end = text.index('\nexport function BillingPage()', start)
replacement = '''export function ContactsPage() {
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
  return <PanelLayout eyebrow="Clientes / Ficha" title="Ficha do cliente" description="Histórico operacional, conversa e dados sincronizados." actions={<PageLink href="/contacts" className="btn-secondary"><ArrowDownRight size={13} /> Voltar para contatos</PageLink>}>
    <DemoBanner /><div className="detail-layout"><aside className="surface detail-nav">{[["overview", "Visão geral"], ["conversation", "Conversa"], ["appointments", "Agendamentos"], ["notes", "Notas internas"], ["history", "Histórico de eventos"]].map(([key, label]) => <button key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}</aside><section className="surface detail-card"><div className="detail-hero"><div className="detail-person"><div className="avatar">{contact.initials}</div><div><h2>{contact.name}</h2><p>{contact.phone} · {contact.city}, {contact.neighborhood}</p></div></div><div className="detail-actions"><button className="btn-secondary"><Phone size={13} /> Ligar</button><PageLink href={`/inbox`} className="btn-primary"><MessageCircle size={13} /> Abrir conversa</PageLink></div></div><div className="detail-stats"><div className="detail-stat"><span>Serviço solicitado</span><strong>{contact.service}</strong></div><div className="detail-stat"><span>Estágio atual</span><strong>{contact.stage}</strong></div><div className="detail-stat"><span>Orçamento</span><strong>{formatCurrency(contact.quote)}</strong></div><div className="detail-stat"><span>IA</span><strong className={contact.aiEnabled ? "green" : "amber"}>{contact.aiEnabled ? "Ativa" : "Pausada"}</strong></div></div>{tab === "overview" && <><SectionTitle eyebrow="Resumo" title="Dados do atendimento" /><div className="timeline"><div className="timeline-row"><div className="timeline-time">{formatChatTime(contact.lastMessageAt)}</div><div className="timeline-marker" /><div className="timeline-copy"><strong>Última mensagem registrada</strong><p>{contact.lastMessage}</p></div></div><div className="timeline-row"><div className="timeline-time">Hoje</div><div className="timeline-marker" /><div className="timeline-copy"><strong>Contato sincronizado</strong><p>Dados carregados da base persistente do Forte Panel.</p></div></div></div></>}{tab === "conversation" && <div className="chat-body" style={{ padding: "4px 0" }}>{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div>}{tab === "appointments" && <div className="list-stack"><EmptyState icon={CalendarCheck2} title="Nenhum agendamento persistido" description="A agenda será conectada à mesma ficha na próxima etapa." /></div>}{tab === "notes" && <div><textarea className="textarea-control" placeholder="Escreva uma nota interna para este contato..." /><button className="btn-primary" style={{ marginTop: 10 }}>Salvar nota</button></div>}{tab === "history" && <div className="timeline">{audit.length > 0 ? audit.map((item) => <div className="timeline-row" key={item.id}><div className="timeline-time">{formatChatTime(item.createdAt.toISOString())}</div><div className="timeline-marker" /><div className="timeline-copy"><strong>{item.action}</strong><p>{item.summary}</p></div></div>) : <EmptyState icon={Clock3} title="Ainda sem eventos de auditoria" description="As próximas ações do operador aparecerão aqui." />}</div>}</section></div>
  </PanelLayout>;
}
'''
path.write_text(text[:start] + replacement + text[end:])
