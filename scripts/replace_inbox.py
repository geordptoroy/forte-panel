from pathlib import Path

path = Path('/home/ubuntu/forte-panel/client/src/pages/PanelPages.tsx')
text = path.read_text()
text = text.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";')
text = text.replace('import PanelLayout, { EmptyState, PageLink, SectionTitle, StatusBadge, ViewToggle } from "@/components/PanelLayout";', 'import PanelLayout, { EmptyState, PageLink, SectionTitle, StatusBadge, ViewToggle } from "@/components/PanelLayout";\nimport { trpc } from "@/lib/trpc";')
text = text.replace('function MessageBubble({ message }: { message: Message }) {\n  const author = message.sender === "lead" ? "Lead" : message.sender === "ai" ? "IA automática" : message.sender === "human" ? "Gabriel" : "Sistema";\n  return <div className={`message-row from-${message.sender}`}><div className="message-bubble"><div className="message-author">{author}</div><div className="message-text">{message.text}</div><div className="message-time">{message.time} {message.sender !== "system" && <Check size={10} style={{ display: "inline", verticalAlign: "middle" }} />}</div></div></div>;\n}', 'function MessageBubble({ message }: { message: Message }) {\n  const author = message.sender === "lead" ? "Lead" : message.sender === "ai" ? "IA automática" : message.sender === "human" ? "Gabriel" : "Sistema";\n  const time = message.time.includes("T") ? new Date(message.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : message.time;\n  return <div className={`message-row from-${message.sender}`}><div className="message-bubble"><div className="message-author">{author}</div><div className="message-text">{message.text}</div><div className="message-time">{time} {message.sender !== "system" && <Check size={10} style={{ display: "inline", verticalAlign: "middle" }} />}</div></div></div>;\n}')
start = text.index('export function InboxPage() {')
end = text.index('\nexport function KanbanPage()', start)
replacement = '''export function InboxPage() {
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
'''
text = text[:start] + replacement + text[end:]
path.write_text(text)
