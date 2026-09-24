# Forte Panel — escopo do produto

## Posicionamento

O Forte Panel será um CRM operacional de WhatsApp para prestadores de serviço e lojas que precisam responder clientes, organizar oportunidades, agendar atendimentos e acompanhar vendas sem depender de várias ferramentas desconectadas.

O produto será multiempresa. Cada empresa terá seus usuários, equipe, canais, serviços, agenda, funil, regras de automação, templates e indicadores. A experiência deve funcionar para clínicas, salões, barbearias, assistência técnica, oficinas, instaladores, lojas com atendimento consultivo e negócios locais em geral.

## Decisão de arquitetura

Easy!Appointments e Clientverse serão removidos da arquitetura do produto. O Forte Panel terá agenda e CRM próprios, com banco de negócio próprio. PAPI será o canal do primeiro teste local; Meta Cloud API oficial será o segundo adapter. O n8n continuará como consumidor e orquestrador opcional por meio da API e dos webhooks do Forte Panel, não como fonte de verdade da interface.

A fonte de verdade será o Forte Panel para contatos, conversas, mensagens, funil, agenda, serviços, profissionais, tarefas, notas, tags, métricas e auditoria. Cada workspace poderá conectar PAPI, WhatsApp Cloud API oficial ou ambos, escolhendo o canal por operação. O n8n poderá receber eventos e executar automações externas, mas todas as ações retornadas deverão passar por endpoints idempotentes do painel.

## Módulos comerciais

| Módulo | O que resolve | Prioridade |
|---|---|---:|
| Inbox WhatsApp | Conversas, mídia, status da IA, atendimento humano e distribuição | P0 |
| CRM de contatos | Perfil, tags, notas, origem, histórico, consentimento e campos personalizados | P0 |
| Funil Kanban | Estágios configuráveis, drag-and-drop, tarefas e motivos de perda | P0 |
| Agenda própria | Serviços, profissionais, duração, disponibilidade, bloqueios e confirmação por WhatsApp | P0 |
| Automação | Gatilhos de mensagem, mudança de estágio, agendamento e follow-up | P1 |
| API e webhooks | Integração com n8n, sites, anúncios e sistemas externos | P1 |
| Relatórios | Conversão, tempo de resposta, ocupação, receita e performance da equipe | P1 |
| Multiusuário | Proprietário, administrador, atendente, agenda e leitura | P0 |
| Planos e limites | Empresas, usuários, conversas, automações e canais por plano | P2 |

## Fluxo principal de venda

Um lead chega pelo WhatsApp, é criado ou associado a um contato existente, recebe uma classificação automática e entra em um estágio do funil. A IA ou o atendente coleta contexto, o operador pode enviar orçamento, criar tarefa ou reservar um horário. A agenda verifica disponibilidade, cria o atendimento e dispara confirmação. O contato avança no funil; mensagens, mudanças e ações ficam auditadas.

## Agenda própria

A agenda deve suportar múltiplos profissionais, locais, serviços, duração, intervalo entre atendimentos, horário de funcionamento, feriados, bloqueios, encaixes, confirmação, cancelamento, reagendamento e status de comparecimento. Cada segmento poderá escolher uma configuração simples ou avançada, sem alterar o modelo de dados central.

## API para n8n

A API terá endpoints versionados e webhooks assinados. O mínimo comercial será:

- `POST /api/v1/webhooks/inbound/whatsapp` para eventos recebidos do canal;
- `POST /api/v1/messages` para envio de mensagem pelo painel ou automação;
- `POST /api/v1/contacts/upsert` para criar ou atualizar contato;
- `PATCH /api/v1/contacts/:id/stage` para movimentar o funil;
- `GET /api/v1/contacts/:id` para consultar contexto;
- `GET /api/v1/availability` para consultar horários;
- `POST /api/v1/appointments` para reservar horário;
- `POST /api/v1/appointments/:id/cancel` e `/reschedule`;
- webhooks para `message.received`, `message.sent`, `contact.created`, `stage.changed`, `appointment.created`, `appointment.confirmed`, `appointment.cancelled` e `task.due`.

Cada requisição mutável terá `Idempotency-Key`, autenticação por workspace e registro de auditoria. A API não deverá expor credenciais do banco, Redis ou PAPI.

## Ordem de construção

Primeiro será consolidado o núcleo multiempresa e a agenda própria, enquanto a Inbox atual permanece como vertical slice de referência. Depois serão adicionados API/webhooks e o worker de automações. Por último entram planos, billing, relatórios avançados e conectores adicionais.
