# Inventário da API operacional da PAPI 1.5.1

## Resposta curta

A auditoria anterior **não cobriu a API inteira**. Ela cobriu principalmente:

- envio de mensagens;
- payloads de mídia e interativos;
- fila e retry;
- instâncias e reconexão;
- recebimento e download de mídia;
- webhooks e eventos básicos do WhatsApp.

A PAPI expõe uma superfície operacional maior. Este documento lista o restante encontrado para decidir o que deve ser incorporado ao Forte Panel.

## 1. Instâncias e administração

A PAPI possui rotas para:

- listar instâncias;
- criar instância;
- excluir instância;
- reconectar;
- obter QR Code;
- consultar status;
- fazer logout;
- consultar status público;
- configurar nome e settings;
- configurar webhook;
- configurar WebSocket;
- configurar proxy;
- configurar integrações Typebot e Chatwoot;
- consultar integrações;
- consultar agente associado à instância;
- criar, consultar e remover configuração de agente.

### Estado no Forte

O Forte já possui parte desta capacidade de forma mais segura e workspace-scoped:

- instâncias Baileys por workspace;
- conexão, desconexão e logout;
- QR/pairing code;
- status;
- configurações operacionais;
- Inbox ligada à instância correta;
- auditoria de ações administrativas.

Não devemos copiar a administração global da PAPI. No Forte, qualquer operação deve continuar limitada ao workspace ou ao Console Admin interno.

## 2. Conversas e histórico

A PAPI não mostrou uma API REST equivalente a “listar todas as conversas com paginação” no `server.ts` catalogado. O modelo dela é principalmente orientado a eventos:

- `messages.upsert` para mensagens novas;
- `messages.update` para status de entrega/leitura;
- `messages.reaction` para reações;
- `presence.update` para presença;
- `contacts.update` para contatos;
- `chats.update` para alterações de conversa;
- `messaging-history.set` para sincronização de histórico;
- `groups.update` para grupos;
- `group-participants.update` para participantes;
- `labels.association` e `labels.edit` para etiquetas.

Esses eventos são transmitidos por webhook e/ou WebSocket.

### Implicação para o Forte

Para “puxar as conversas do WhatsApp”, o caminho correto não é copiar uma rota REST da PAPI. É garantir:

1. recebimento confiável de `messages.upsert`;
2. recebimento de `messaging-history.set` quando uma instância sincroniza;
3. idempotência por instância + message id;
4. persistência de contato, conversa e mensagem no workspace correto;
5. atualização de status de entrega;
6. atualização de presença e reações;
7. reconciliação quando o webhook falhar.

O Forte já possui Inbox, contatos, conversas e eventos persistidos. A lacuna deve ser medida contra eventos específicos, não contra a existência de uma rota genérica de “get chats”.

## 3. Contatos e identidade

A PAPI trabalha com:

- JID normalizado;
- número telefônico;
- JID alternativo/LID;
- validação de número com `onWhatsApp`;
- foto de perfil;
- atualização de contatos;
- contatos de grupo;
- eventos de alteração de contato.

### Rotas observadas relacionadas

- `GET /api/instances/:id/profile-picture/:jid`;
- `GET /api/instances/:id/check-number/:phone`;
- eventos `contacts.update`;
- eventos `chats.update`.

### Estado no Forte

O Forte já possui normalização de JID, contatos e isolamento por workspace. Ainda é recomendável adicionar como fatia própria:

- consulta explícita de existência/registro do número;
- resolução de `@lid` e JID alternativo;
- foto de perfil com cache e expiração;
- reconciliação de nome/foto sem sobrescrever nomes comerciais editados pelo operador.

## 4. Grupos

A PAPI expõe:

- listar grupos;
- criar grupo;
- consultar metadata do grupo;
- obter código de convite;
- adicionar participantes;
- remover participantes;
- promover/rebaixar participantes;
- alterar settings do grupo;
- sair do grupo;
- receber eventos de grupo;
- receber eventos de participantes.

### Rotas observadas

- `GET /api/instances/:id/groups`;
- `POST /api/instances/:id/groups/create`;
- `GET /api/instances/:id/groups/:groupId/metadata`;
- `GET /api/instances/:id/groups/:groupId/invite-code`;
- `POST /api/instances/:id/groups/:groupId/participants`;
- `PUT /api/instances/:id/groups/:groupId/settings`;
- `POST /api/instances/:id/groups/:groupId/leave`.

### Estado no Forte

O Forte já mostra grupos na Inbox e preserva participantes/metadados recebidos. As mutações de grupo ainda devem ser tratadas como uma fatia futura, porque têm impacto externo e exigem:

- permissão de administrador do grupo;
- confirmação de operação no painel;
- auditoria;
- tratamento de falhas parciais ao alterar vários participantes.

## 5. Perfil da conta WhatsApp

A PAPI permite:

- consultar e alterar foto de perfil;
- alterar status textual;
- alterar nome do perfil;
- consultar privacidade;
- bloquear e desbloquear contatos;
- publicar presença online/offline/digitando/gravação;
- marcar mensagens como lidas.

### Rotas observadas

- `GET /api/instances/:id/profile-picture/:jid`;
- `PUT /api/instances/:id/profile-picture`;
- `PUT /api/instances/:id/profile-status`;
- `PUT /api/instances/:id/profile-name`;
- `GET /api/instances/:id/privacy-settings`;
- `POST /api/instances/:id/block`;
- `POST /api/instances/:id/presence`;
- `POST /api/instances/:id/read-messages`;
- `GET /api/instances/:id/blocked`.

### Prioridade

Para o Forte Panel comercial, as prioridades são:

1. marcar como lida;
2. presença durante composição/envio;
3. foto/nome do perfil no Console Admin;
4. bloqueio/desbloqueio com confirmação;
5. privacidade e edição de perfil somente em uma etapa posterior.

## 6. Mensagens já catalogadas

A PAPI possui endpoints separados para:

- texto;
- imagem;
- vídeo;
- áudio;
- documento;
- localização;
- contato;
- reação;
- sticker;
- enquete;
- botões;
- lista;
- carrossel;
- produto;
- múltiplos produtos;
- editar mensagem;
- apagar mensagem.

No Forte, os tipos básicos já passam pelo contrato de mensagem unificado. Botões e listas usam contratos específicos. Carrossel, catálogo/produtos, edição e exclusão ainda devem ser considerados fatias separadas.

## 7. Catálogo WhatsApp

A PAPI possui operações de:

- listar catálogo;
- listar coleções;
- consultar produto por número;
- criar produto;
- atualizar produto;
- excluir produto;
- criar coleção;
- excluir coleção;
- enviar produto;
- enviar vários produtos.

### Estado no Forte

O catálogo de serviços/profissionais do Forte é um catálogo comercial interno, não o catálogo de produtos do WhatsApp. Não se deve misturar os dois modelos. A integração com catálogo WhatsApp deve ser criada somente se houver requisito comercial explícito.

## 8. Webhook e WebSocket

A PAPI permite:

- configurar URL de webhook por instância;
- configurar segredo/eventos;
- habilitar/desabilitar webhook;
- configurar WebSocket;
- enviar eventos em tempo real;
- consultar configuração atual.

Os eventos observados incluem:

- mensagem recebida;
- mensagem enviada pelo próprio número;
- status de mensagem;
- reação;
- presença;
- mudança de grupo;
- mudança de participantes;
- contato atualizado;
- conversa atualizada;
- etiqueta alterada;
- histórico sincronizado.

### Estado no Forte

O Forte já utiliza webhook assinado, anti-replay, idempotência, outbox e normalização de eventos Baileys. O próximo endurecimento deve ser um inventário de cobertura evento a evento, não uma cópia da configuração de webhook da PAPI.

## 9. Fila e observabilidade

A PAPI expõe:

- status global da fila;
- estatísticas globais;
- estatísticas por instância;
- mensagens pendentes;
- mensagens falhadas;
- retry de falhas;
- limpeza da fila;
- configuração de fila por instância;
- estatísticas gerais da API.

O Forte já tem worker, tentativas, estados de mensagem, heartbeat, logs e reconciliação. Ainda vale adicionar no Console Admin:

- pendências por instância;
- falhas por tipo de mensagem;
- último erro técnico sanitizado;
- retry manual restrito a operadores;
- correlação entre mensagem local e `externalId`.

## 10. Agentes e integrações específicas da PAPI

A PAPI também contém endpoints de:

- agentes próprios;
- Typebot;
- Chatwoot;
- licenciamento;
- proxy;
- administração proprietária;
- rotas de autenticação do painel.

Esses componentes **não devem ser copiados** para o Forte. O Forte tem sua própria arquitetura de IA, CORE_ONLY_MODE, kill switch, workspace interno e controle de agentes.

## 11. O que realmente precisamos implementar no Forte

### Prioridade imediata

1. **Anexos transitórios** — já aplicado no commit `f24e73e`.
2. **Áudio/voice note no navegador** — corrigir a camada `getUserMedia` e gravação.
3. **Lista e enquete** — validar cada envelope com retorno no celular.
4. **Cobertura de eventos de conversa e histórico** — confirmar `messages.upsert`, `messages.update`, `chats.update` e `messaging-history.set`.
5. **Status de leitura e presença** — para a Inbox parecer operacional em tempo real.

### Prioridade seguinte

6. foto/nome do perfil WhatsApp;
7. consulta de número/JID;
8. grupos e participantes;
9. fila/observabilidade por instância;
10. apagar/editar mensagem;
11. carrossel;
12. catálogo WhatsApp, apenas se necessário.

## 12. Decisão arquitetural

A PAPI é uma referência de comportamento do Baileys, não uma dependência do Forte.

O Forte deve manter:

- seu próprio gateway;
- seus próprios contratos;
- seu próprio isolamento multi-tenant;
- seu próprio modelo de auditoria;
- seu próprio kill switch de IA;
- `CORE_ONLY_MODE = true`;
- imagens GHCR `dev`;
- nenhuma credencial real ou provedor externo copiado.

A conclusão é: **sim, precisamos absorver algumas capacidades operacionais da PAPI, mas não “a API deles inteira” como um bloco**. O próximo trabalho técnico correto é uma matriz de cobertura de eventos e operações do Forte, seguida por fatias pequenas, começando por histórico/conversas, presença/leitura e grupos.
