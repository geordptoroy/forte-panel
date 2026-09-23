from pathlib import Path

path = Path('/home/ubuntu/forte-panel/client/src/pages/PanelPages.tsx')
text = path.read_text()
start = text.index('export function KanbanPage() {')
end = text.index('\nexport function AgendaPage()', start)
replacement = '''export function KanbanPage() {
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
'''
path.write_text(text[:start] + replacement + text[end:])
