# 0004 — Inbox, mensagens e atendimento

**Estado:** parcial — os principais fluxos existem e têm cobertura de contratos, tenancy e Baileys; a actualização temporal monotónica está corrigida e provada, mas falta fechar a matriz endpoint→capacidade→auditoria e a execução completa sem skips.

**Fonte observada:** `server/db.ts`, `server/routers.ts`, `server/inbox-instance-filter.integration.test.ts`, `server/inbox-read-state.test.ts`, `server/contact-stage.test.ts`, `drizzle/schema.ts`, `forte-whatsapp/src/message-normalization.ts` e os contratos de webhook/outbox.

## 1. Objectivo

Definir o contrato operacional da Inbox do Forte Panel: ingestão de mensagens, criação e actualização de contactos/conversas, leitura por instância Baileys, estados de atendimento, leads/oportunidades ligados e efeitos assíncronos.

A Inbox é um domínio tenant-scoped. O frontend pode pedir filtros e acções, mas nunca escolhe o workspace efectivo nem prova ownership de um recurso.

## 2. Princípios

> **Uma mensagem pertence a um workspace, a uma conversa e, quando conhecida, a uma origem Baileys; toda leitura, mutation e emissão de efeito deve preservar essa cadeia de ownership.**

> **A data recebida pelo provider é a data de domínio. A persistência e os testes devem usar uma precisão explicitamente contratada; não se deve comparar milissegundos se o tipo/migration SQL os descarta.**

## 3. Não-objectivos

- Não introduzir provider alternativo, webhook genérico ou adapter fora de Baileys.
- Não emparelhar, limpar sessão ou enviar mensagens reais como parte de testes.
- Não permitir seed/demo na instância de produção.
- Não transformar o browser em fonte de autorização.
- Não apagar histórico para acomodar um filtro de instância.

## 4. Modelo de dados e ownership

### 4.1 Entidades

- `contacts.workspaceId` é a fronteira primária do contacto.
- `conversations.contactId` herda o workspace através do contacto.
- `messages.conversationId` herda o workspace através da conversa/contacto.
- `messages.metadata.instanceId`, quando presente, identifica a origem Baileys; uma origem desconhecida não pode ser reinterpretada como outra instância.
- `whatsappInstances.workspaceId` é a autoridade para validar que uma instância está activa e pertence ao workspace.
- `leads` e `opportunities` são ligados ao contacto/workspace e não podem ser criados ou actualizados a partir de um contacto estrangeiro.

### 4.2 Regra de escopo

Todo entrypoint recebe primeiro o `workspaceId` confiável derivado do contexto autenticado ou do evento validado. Inputs de cliente com `workspaceId` são compatibilidade, não autoridade.

Lookups de recursos usam `(workspaceId, id)` ou uma relação que prove o workspace. Um ID válido noutro workspace deve resultar em `NOT_FOUND`/erro de domínio genérico e não revelar dados do tenant estrangeiro.

## 5. Ingestão inbound

O callback Baileys deve:

1. validar provider e autenticação antes de efeitos;
2. validar instância activa e ownership do workspace;
3. normalizar telefone/JID, tipo de mensagem, metadata e `fromMe`;
4. aplicar idempotência por `eventId`/identificador externo;
5. criar ou actualizar contacto/conversa dentro do workspace;
6. persistir a mensagem com a data de domínio recebida;
7. criar lead/oportunidade apenas para mensagem live elegível;
8. emitir evento downstream apenas depois da persistência confirmada.

Eventos históricos (`append`/history sync) são idempotentes, não criam unread, takeover, lead ou evento de mensagem recebida. Payloads vazios/desconhecidos são ignorados sem criar contacto.

Mensagens `fromMe` representam atendimento humano: não criam evento de mensagem recebida, limpam unread e suspendem AI/takeover conforme o contrato actual. O comportamento deve ser coberto por teste negativo para evitar duplicação de efeitos.

## 6. Leitura e filtro por instância

- Sem filtro, o workspace pode ver mensagens próprias e linhas legadas sem `instanceId`.
- Com uma ou mais instâncias, só entram mensagens com `metadata.instanceId` numa lista permitida.
- Uma mensagem de instância de outro workspace nunca entra, mesmo que a conversa/contacto pertença ao workspace corrente.
- Pré-visualizações e ordenação devem usar o mesmo conjunto filtrado da thread; não é aceitável filtrar a thread e deixar o preview escapar de outra origem.
- Conversas e contactos sem origem devem continuar visíveis em `All` para preservar histórico, mas não podem ser atribuídos artificialmente a uma instância.

## 7. Estados de atendimento

| Estado            | Invariante                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| unread            | Só mensagens inbound live elegíveis incrementam unread; histórico/fromMe não incrementam.            |
| read              | Marcar como lida exige conversa/contacto no workspace; não altera outro tenant.                      |
| human-controlled  | Mensagem manual/fromMe ou fluxo de grupo pode activar takeover; a mutation deve ser tenant-scoped.   |
| AI-enabled        | Activação/desactivação é uma mutation autorizada sobre contacto do workspace.                        |
| stage/opportunity | Mudança de etapa actualiza o contacto e a oportunidade correspondente, sem aceitar IDs estrangeiros. |

As transições relevantes devem produzir auditoria de domínio segura, com workspace e actor quando disponíveis. Falhas não produzem auditoria de sucesso.

## 8. Idempotência e concorrência

- Repetir o mesmo evento inbound não cria segunda mensagem, contacto, lead, oportunidade ou evento de domínio.
- A chave de idempotência deve ser estável e tenant-aware quando o contrato exigir isolamento por workspace.
- Upserts devem manter ownership no conflito; nunca alterar a linha de outro workspace por coincidência de telefone, JID ou ID externo.
- As actualizações de actividade devem ser monotónicas quando a mensagem recebida tem data de domínio anterior a uma actividade já registada.

## 9. Precisão temporal

O tipo SQL e a migration são a fonte da precisão garantida. Os testes devem:

1. inserir datas com o menor intervalo que o tipo preserva;
2. verificar a precisão efectiva com uma leitura directa quando necessário;
3. comparar valores normalizados à precisão contratada, sem criar uma falsa garantia de milissegundos;
4. manter uma prova separada de ordenação/idempotência quando a precisão não for suficiente para ordenar eventos próximos.

A falha histórica de `inbox-instance-filter.integration.test.ts` não era truncamento da precisão SQL: o segundo evento entrava no fluxo, mas o upsert não fazia avançar `lastActivityAt`. `ensureLeadOpportunityForContact` passou a executar uma actualização explícita condicionada a `lastActivityAt IS NULL OR lastActivityAt < activityAt`, preservando a monotonicidade e evitando regressão por eventos atrasados. A suite PostgreSQL descartável confirmou **8/8 testes**.

## 10. Segurança e testes negativos

Cada mutation/consulta Inbox deve provar, quando aplicável:

- não autenticado ou membership inactiva;
- capability insuficiente;
- contacto, conversa, mensagem, lead, oportunidade ou instância de outro workspace;
- `workspaceId` adulterado no payload;
- instância inactiva, inexistente ou de outro workspace;
- evento duplicado;
- evento histórico que tentaria criar efeitos live;
- mensagem `fromMe` que tentaria emitir evento recebido;
- falha de uma mutation sem auditoria de sucesso nem alteração parcial indevida.

## 11. Critérios de aceitação

A spec só passa a **implementada** quando existir:

- matriz completa endpoint→actor→workspace source→capability→audit→negative test;
- suite PostgreSQL sem skips para isolamento por workspace e por instância;
- prova de idempotência inbound e ausência de efeitos históricos indevidos;
- decisão documentada sobre a precisão temporal e teste compatível;
- validação de `pnpm check`, testes completos e build sem alterar a instalação real ou contactar WhatsApp;
- a suite de instâncias e Leads passa sem skips contra PostgreSQL descartável.

## 12. Implementação observada

Já existem contratos e testes para `listInboxContacts`, `listMessagesForContact`, leitura de conversa, estado unread, ingestão Baileys, grupos, leads/oportunidades, envio manual e isolamento cross-tenant. O módulo `server/db.ts` usa o workspace confiável e valida instâncias Baileys em vários entrypoints.

A cobertura ainda é parcial: o inventário endpoint a endpoint, a precisão temporal PostgreSQL e a execução completa com zero skips continuam pendentes.
