export type Urgency = "Baixa" | "Média" | "Alta" | "Crítica";
export type Stage =
  | "Novo contato"
  | "Triagem"
  | "Aguardando foto"
  | "Avaliação pendente"
  | "Orçamento enviado"
  | "Aguardando decisão"
  | "Visita solicitada"
  | "Agendado"
  | "Concluído"
  | "Sem retorno"
  | "Perdido";

export type Contact = {
  id: string;
  name: string;
  phone: string;
  service: string;
  urgency: Urgency;
  city: string;
  neighborhood: string;
  stage: Stage;
  aiEnabled: boolean;
  unread: number;
  lastMessage: string;
  lastMessageAt: string;
  quote: number;
  pending: number;
  daysNoReply: number;
  initials: string;
};

export type Message = {
  id: string;
  sender: "lead" | "ai" | "human" | "system";
  text: string;
  time: string;
};

export type Appointment = {
  id: string;
  contactId: string;
  service: string;
  date: string;
  time: string;
  duration: string;
  status: "Confirmado" | "Pendente" | "Solicitado";
  origin: string;
  notes: string;
};

export type Quote = {
  id: string;
  contactId: string;
  service: string;
  description: string;
  quoted: number;
  received: number;
  status: "Orçamento" | "Aguardando aprovação" | "Aprovado" | "Parcialmente pago" | "Pago";
  date: string;
  due: string;
};

export const stageOrder: Stage[] = [
  "Novo contato",
  "Triagem",
  "Aguardando foto",
  "Avaliação pendente",
  "Orçamento enviado",
  "Aguardando decisão",
  "Visita solicitada",
  "Agendado",
  "Concluído",
  "Sem retorno",
  "Perdido",
];

export const contacts: Contact[] = [
  {
    id: "c1",
    name: "Juliana Alves",
    phone: "(11) 99842-1104",
    service: "Instalação de chuveiro",
    urgency: "Alta",
    city: "São Paulo",
    neighborhood: "Vila Mariana",
    stage: "Triagem",
    aiEnabled: false,
    unread: 2,
    lastMessage: "Consigo enviar as fotos ainda hoje.",
    lastMessageAt: "10:42",
    quote: 380,
    pending: 380,
    daysNoReply: 0,
    initials: "JA",
  },
  {
    id: "c2",
    name: "Marcos Ferreira",
    phone: "(11) 98710-4522",
    service: "Quadro elétrico",
    urgency: "Crítica",
    city: "São Paulo",
    neighborhood: "Moema",
    stage: "Visita solicitada",
    aiEnabled: true,
    unread: 1,
    lastMessage: "A energia caiu novamente no apartamento.",
    lastMessageAt: "09:18",
    quote: 950,
    pending: 950,
    daysNoReply: 0,
    initials: "MF",
  },
  {
    id: "c3",
    name: "Renata Costa",
    phone: "(11) 97651-2088",
    service: "Tomadas e iluminação",
    urgency: "Média",
    city: "São Paulo",
    neighborhood: "Pinheiros",
    stage: "Orçamento enviado",
    aiEnabled: true,
    unread: 0,
    lastMessage: "Vou analisar o orçamento com meu marido.",
    lastMessageAt: "Ontem",
    quote: 620,
    pending: 620,
    daysNoReply: 1,
    initials: "RC",
  },
  {
    id: "c4",
    name: "Paulo Mendes",
    phone: "(11) 96540-7721",
    service: "Manutenção preventiva",
    urgency: "Baixa",
    city: "São Paulo",
    neighborhood: "Aclimação",
    stage: "Agendado",
    aiEnabled: true,
    unread: 0,
    lastMessage: "Perfeito, nos vemos na quinta.",
    lastMessageAt: "Ontem",
    quote: 280,
    pending: 0,
    daysNoReply: 0,
    initials: "PM",
  },
  {
    id: "c5",
    name: "Camila Souza",
    phone: "(11) 95442-0190",
    service: "Ventilador de teto",
    urgency: "Média",
    city: "São Paulo",
    neighborhood: "Saúde",
    stage: "Sem retorno",
    aiEnabled: false,
    unread: 0,
    lastMessage: "Pode me chamar quando tiver disponibilidade.",
    lastMessageAt: "22/09",
    quote: 430,
    pending: 430,
    daysNoReply: 3,
    initials: "CS",
  },
];

export const messagesByContact: Record<string, Message[]> = {
  c1: [
    { id: "m1", sender: "system", text: "Conversa iniciada pelo WhatsApp", time: "10:21" },
    { id: "m2", sender: "lead", text: "Oi Gabriel, preciso trocar meu chuveiro. Você atende na Vila Mariana?", time: "10:22" },
    { id: "m3", sender: "ai", text: "Olá, Juliana. Atendo sim. Para te orientar melhor, consegue enviar uma foto do ponto de instalação?", time: "10:23" },
    { id: "m4", sender: "lead", text: "Consigo enviar as fotos ainda hoje.", time: "10:42" },
  ],
  c2: [
    { id: "m5", sender: "lead", text: "Bom dia, a energia caiu novamente no apartamento.", time: "09:16" },
    { id: "m6", sender: "ai", text: "Entendi, Marcos. Vou sinalizar como prioridade. Você está sem energia em todos os cômodos?", time: "09:17" },
    { id: "m7", sender: "lead", text: "Sim, e o disjuntor não permanece ligado.", time: "09:18" },
  ],
  c3: [
    { id: "m8", sender: "lead", text: "Recebi o orçamento, obrigado.", time: "Ontem" },
    { id: "m9", sender: "human", text: "Fico à disposição, Renata. Se quiser, posso explicar cada item por aqui.", time: "Ontem" },
    { id: "m10", sender: "lead", text: "Vou analisar o orçamento com meu marido.", time: "Ontem" },
  ],
  c4: [
    { id: "m11", sender: "ai", text: "Sua manutenção ficou reservada para quinta-feira às 14:00.", time: "Ontem" },
    { id: "m12", sender: "lead", text: "Perfeito, nos vemos na quinta.", time: "Ontem" },
  ],
  c5: [
    { id: "m13", sender: "lead", text: "Pode me chamar quando tiver disponibilidade.", time: "22/09" },
    { id: "m14", sender: "system", text: "IA pausada automaticamente após 3 dias sem resposta", time: "22/09" },
  ],
};

export const appointments: Appointment[] = [
  { id: "a1", contactId: "c4", service: "Manutenção preventiva", date: "26/09/2026", time: "14:00", duration: "1h30", status: "Confirmado", origin: "Easy!Appointments", notes: "Revisar quadro e tomadas da sala." },
  { id: "a2", contactId: "c2", service: "Quadro elétrico", date: "26/09/2026", time: "17:30", duration: "2h", status: "Pendente", origin: "Solicitação manual", notes: "Cliente relatou queda recorrente de energia." },
  { id: "a3", contactId: "c1", service: "Instalação de chuveiro", date: "28/09/2026", time: "09:00", duration: "1h", status: "Solicitado", origin: "WhatsApp", notes: "Aguardando confirmação das fotos." },
];

export const quotes: Quote[] = [
  { id: "q1", contactId: "c2", service: "Quadro elétrico", description: "Revisão de disjuntores e reorganização do quadro.", quoted: 950, received: 0, status: "Aprovado", date: "23/09/2026", due: "30/09/2026" },
  { id: "q2", contactId: "c3", service: "Tomadas e iluminação", description: "Troca de tomadas e instalação de dois pontos de luz.", quoted: 620, received: 0, status: "Aguardando aprovação", date: "22/09/2026", due: "29/09/2026" },
  { id: "q3", contactId: "c4", service: "Manutenção preventiva", description: "Inspeção geral e reaperto de conexões.", quoted: 280, received: 280, status: "Pago", date: "20/09/2026", due: "26/09/2026" },
  { id: "q4", contactId: "c5", service: "Ventilador de teto", description: "Instalação com ajuste de fiação existente.", quoted: 430, received: 0, status: "Orçamento", date: "19/09/2026", due: "27/09/2026" },
];

export const events = [
  { type: "inbox", title: "Nova mensagem de Juliana Alves", meta: "Conversa movida para Triagem", time: "há 4 min" },
  { type: "calendar", title: "Agendamento solicitado por Marcos Ferreira", meta: "Sábado, 26/09 às 17:30", time: "há 1h" },
  { type: "kanban", title: "Renata Costa avançou no funil", meta: "Triagem → Orçamento enviado", time: "há 3h" },
  { type: "billing", title: "Pagamento recebido de Paulo Mendes", meta: "R$ 280,00 registrado", time: "ontem" },
];

export const integrations = [
  { name: "PAPI / Evolution", key: "papi", description: "Mensagens de WhatsApp e mídia", status: "disconnected", detail: "Configure PAPI_BASE_URL e o segredo do webhook." },
  { name: "n8n Agent", key: "n8n", description: "Automação e resposta da IA", status: "connected", detail: "Workflow de atendimento disponível para eventos demo." },
  { name: "Clientverse CRM", key: "crm", description: "Contatos, clientes e notas", status: "pending", detail: "Aguardando CLIENTVERSE_API_TOKEN." },
  { name: "Easy!Appointments", key: "agenda", description: "Disponibilidade e agendamentos", status: "disconnected", detail: "Configure a URL e as credenciais da agenda." },
] as const;

export const getContact = (id: string) => contacts.find((contact) => contact.id === id) ?? contacts[0];
export const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
