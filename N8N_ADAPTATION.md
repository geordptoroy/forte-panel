# Adaptação do workflow n8n ao Forte Panel

## O que foi recebido

O arquivo enviado contém um workflow n8n com **34 nós**. Ele começa no `PAPI Trigger`, passa por uma etapa de limpeza e normalização, trata mensagens de texto, botões, listas, imagens, áudio, vídeo, documentos, stickers, localização e anúncios CTWA, aplica debounce e conduz a mensagem ao `AI Agent`.

O agente usa memória PostgreSQL, modelo NVIDIA NIM, ferramenta de agenda, ferramenta de memória do lead e controle humano. O fluxo também possui análise de imagem, transcrição de áudio, resposta em texto, botões e áudio, atualização de presença, espera entre bolhas e comandos explícitos como `#humano`, `#assumir`, `#pausar`, `#retomar` e `#bot`.

Há uma ferramenta antiga chamada `Call 'Tool CRM Clientverse — Forte Media'`. Ela deve ser removida do fluxo final, pois o Forte Panel será a fonte de verdade do CRM. A lógica da `Lead Memory Tool` deve ser migrada para endpoints do Forte Panel, sem manter dois CRMs concorrentes.

## Arquitetura recomendada

A melhor primeira versão não é substituir tudo de uma vez. O caminho mais seguro é manter o **n8n como orquestrador de IA e automações**, enquanto o **Forte Panel passa a ser a fonte de verdade** para contatos, conversas, mensagens, funil, agenda, configurações da empresa e auditoria. O PAPI e a Meta Cloud API são somente canais de transporte.

Essa separação preserva o workflow que já funciona e evita reimplementar de imediato debounce, mídia, ferramentas LangChain, memória conversacional, controle humano e respostas em múltiplas bolhas. Ao mesmo tempo, elimina Clientverse e Easy!Appointments do produto e impede que o n8n vire o banco principal da aplicação.

O desenho final será:

| Camada | Responsabilidade |
|---|---|
| Forte Panel | Fonte de verdade, CRM, Inbox, agenda, prompt publicado, canais, auditoria e API |
| n8n | Orquestração, agente de IA, mídia, debounce, memória conversacional e automações externas |
| PAPI | Canal WhatsApp não oficial já usado no workflow |
| Meta Cloud API | Canal oficial alternativo, selecionável por workspace/canal |
| Worker | Envio, retries limitados, recuperação após reinício e status de entrega |

PAPI e Meta podem coexistir no produto, inclusive em workspaces diferentes ou em números diferentes. **Não devemos operar o mesmo número simultaneamente pelos dois provedores**, pois a sessão PAPI e o registro oficial Cloud API são modelos de conexão diferentes.

## Mapeamento do workflow atual

| Parte atual do n8n | Destino recomendado |
|---|---|
| `PAPI Trigger` | Adapter PAPI; futuramente adapter Meta para webhook oficial |
| `Limpeza` | Manter no n8n inicialmente e enviar evento normalizado ao Panel |
| Decrypt, Gemini, transcrição e análise de mídia | Manter no n8n na primeira fase |
| Debounce | Manter no n8n inicialmente; mover para worker Redis depois |
| `Lead Memory Tool` | Substituir por API idempotente do Forte Panel |
| `Agenda` | Substituir por API de disponibilidade/agendamento do Forte Panel |
| `Call Tool CRM Clientverse` | Remover; usar contatos, notas e estágio do Forte Panel |
| `Postgres Chat Memory` | Manter como memória de conversa do agente; não usar como CRM |
| `Human Control automático` | Manter no n8n, com estado humano também registrado no Panel |
| `SendText`, `SendButtons`, `SendAudio` PAPI | Primeiro manter para teste local; depois usar `POST /api/v1/messages` e worker |
| `NVIDIA NIM Chat Model` | Manter inicialmente; permitir trocar por LocalAI no ambiente local |

## Onboarding inteligente da empresa

A empresa não deve escrever um prompt livre e esperar que a IA resolva tudo. O onboarding deve coletar dados estruturados:

- segmento e descrição do negócio;
- serviços, duração, preço inicial e regras de orçamento;
- cidade, bairros e área de atendimento;
- horários, profissionais e regras da agenda;
- tom de voz e palavras que devem ser evitadas;
- perguntas frequentes e respostas aprovadas;
- política de cancelamento, reagendamento e sinal;
- regras de segurança e situações que exigem atendimento humano;
- estágio inicial, critérios de qualificação e gatilhos de follow-up;
- provedor de WhatsApp e canal padrão.

A IA poderá transformar esses dados em um prompt operacional, mas o sistema deve salvar tanto o **perfil estruturado** quanto o **prompt gerado versionado**. O operador revisa e publica a versão. O n8n consulta somente a configuração publicada, nunca um prompt aleatório enviado pelo cliente.

## Plano de teste local

### Fase 1 — testar sem envio real pelo Panel

1. Subir somente `postgres_n8n`, `postgres_papi`, `redis_papi`, `n8n`, `pastorini_api`, `qdrant` e, opcionalmente, `localai`.
2. Não subir Easy!Appointments nem Clientverse; eles não fazem mais parte do produto.
3. Remapear o PAPI para uma porta diferente da porta do Forte Panel, por exemplo `3001:3000` no host.
4. Manter o Forte Panel rodando com `pnpm dev` na porta 3000.
5. Importar o workflow original no n8n e validar o atendimento usando PAPI, sem conectar ainda a Meta oficial.
6. Adicionar ao fluxo um HTTP Request para enviar o evento normalizado ao endpoint inbound do Forte Panel.
7. Substituir primeiro apenas a ferramenta de CRM antiga por chamadas ao Panel; o envio ainda pode permanecer nos nós PAPI nesta fase.

O primeiro endpoint para essa troca já está disponível: `POST /api/v1/lead-memory`. Ele preserva as quatro ações que a ferramenta antiga descreve — `buscar_lead`, `criar_lead`, `atualizar_lead` e `registrar_nota` — mas grava no CRM próprio, com auditoria e idempotência.

### Fase 2 — Panel como fonte de verdade

1. O workflow chama `POST /api/v1/contacts/upsert` ao identificar ou atualizar um lead.
2. O workflow chama `POST /api/v1/webhooks/inbound/whatsapp` para registrar a mensagem recebida.
3. A ferramenta de agenda consulta `GET /api/v1/availability` e usa `POST /api/v1/appointments`.
4. Mudanças de estágio usam `PATCH /api/v1/contacts/:id/stage`.
5. Mensagens geradas pelo agente usam `POST /api/v1/messages` com `provider: papi` ou `provider: meta_cloud_api`.
6. Cada chamada mutável usa `Idempotency-Key` e nunca grava diretamente no banco do Panel.

### Fase 3 — worker e prompt publicado

O worker separado já consome mensagens `queued`, escolhe o adapter do provedor, recupera mensagens em `processing` após reinício e marca `sent` ou `failed` após as tentativas configuradas. O onboarding também salva o perfil estruturado e publica versões do prompt operacional; o n8n pode buscar somente a versão publicada por `GET /api/v1/onboarding/prompt`.

Depois do teste local com PAPI, será ativado o adapter Meta Cloud API com token permanente, Phone Number ID e webhook HTTPS público. A Meta documenta que a Cloud API envia mensagens e recebe webhooks de mensagens e status, mas o endpoint precisa ser configurado na plataforma Meta e não funciona como substituto local do PAPI sem credenciais e configuração de negócio.

## Decisão

Para o MVP local, manteremos **n8n + Forte Panel + PAPI**. A Meta Cloud API ficará pronta como segundo adapter, mas não será o primeiro canal de teste. O Forte Panel não reimplementa a inteligência do workflow; ele fornece fonte de verdade, prompt publicado, API, fila e worker. O próximo passo de integração é trocar o nó Clientverse pela chamada HTTP ao `lead-memory` no workflow real e enviar o evento normalizado ao webhook inbound do Panel.
