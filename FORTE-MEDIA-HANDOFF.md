# Forte Media — handoff técnico

> **DOCUMENTO HISTÓRICO — revisto em 2026-10-02.** Este ficheiro preserva decisões e evidências de um estado anterior e não define o produto ou os procedimentos atuais. O único canal do produto é Baileys. Não executar opções de canal, comandos, branches, tags ou tarefas pendentes daqui; consultar `AGENTS.md`, `PRODUCT_SCOPE.md`, `docs/STATUS-ATUAL.md` e `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`.





**Data:** 2026-09-27
**Repositório:** `geordptoroy/forte-panel`  
**Branch:** `main`  
**Último commit:** commit desta atualização; consulte `git log -1`.

## Objetivo do projeto

Construir um CRM multi-tenant para beta testers, com Inbox e agentes, removendo a dependência operacional da PAPI e oferecendo dois provedores escolhidos por workspace:

1. **Baileys nativo**, executado pelo gateway `forte-whatsapp`;
2. **WABA / Meta Cloud API**, opcional para clientes que escolherem a API oficial da Meta.

A PAPI não faz parte do Compose oficial atual.

## Estado atual confirmado

> **Atualização 2026-09-26:** o gateway Baileys nativo é o caminho local atual. O commit `4c5c483` adicionou mídia recebida, conteúdo multimodal, envio genérico e eventos de chamadas; o commit `5f9846a` refinou a interface de APIs por operação e alinhou o roadmap. As seções históricas abaixo preservam evidências antigas, mas não substituem o contrato atual em `API_CONTRACT.md`.

### Docker local do usuário

Pasta correta:

```text
C:\Users\Rafae\Desktop\forte-media
```

O Docker foi zerado anteriormente. A instalação atual foi criada do zero com volumes novos.

Serviços atuais:

```text
forte_media_postgres
forte_media_redis
forte_media_panel
forte_media_worker
forte_media_whatsapp
```

Compose atual contém apenas:

```text
postgres_panel
redis_panel
forte-panel
forte-panel-worker
forte-whatsapp
```

Não existem no Compose atual:

```text
pastorini_api
postgres_papi
redis_papi
PAPI_API_KEY
PAPI_LICENSE_KEY
PAPI_CLOUD_PANEL_TOKEN
```

### Banco e Panel

- PostgreSQL inicia saudável.
- Redis inicia saudável.
- Migrations são aplicadas automaticamente pelo Panel.
- Log confirmado:

```text
[✓] migrations applied successfully!
Server running on port 3000
```

### WhatsApp / Baileys

Pareamento realizado com sucesso.

Estado confirmado anteriormente:

```json
{
  "status": "ready",
  "instance": {
    "instanceId": "default",
    "status": "connected",
    "phone": "5511999828045"
  }
}
```

A sessão é preservada no volume:

```text
forte-media_forte_whatsapp_sessions
```

Não usar `down -v` durante testes normais, pois isso apaga o pareamento.

### Inbound

O fluxo inbound já funcionou:

```text
WhatsApp → Baileys → webhook → Forte Panel → PostgreSQL → Inbox
```

Uma mensagem apareceu no Inbox após a reinstalação limpa.

### Worker

O worker está saudável e processa filas:

```text
[forte-worker] processadas=1 enviadas=1 falhas=0 limitadas=0
[forte-worker] eventos=1 entregues=1 falhas=0
```

Esses números confirmam processamento interno, mas ainda não confirmam entrega física no WhatsApp.

## Commits importantes

### `c3d4ac1`

- Removeu `docker-compose.yaml` duplicado.
- Substituiu `docker-compose.yml` por Compose nativo sem PAPI.
- Criou `FORTE-MEDIA-PROVIDERS.md`.

### `3b60c15`

- Corrigiu o provedor padrão quando Baileys está configurado.
- Se não há configuração de workspace, Baileys passa a ser o padrão quando `BAILEYS_BASE_URL` e `BAILEYS_API_KEY` existem.
- Corrigiu mensagens inbound para gravar `provider = baileys` quando o metadata informa Baileys.

### `7444316`

- Gateway preserva o JID recebido pelo WhatsApp.
- Gateway aceita JIDs completos no envio, por exemplo `123...@lid` ou `5511...@s.whatsapp.net`.
- Metadata inbound Baileys inclui `jid`.
- Adapter outbound usa `metadata.jid` quando disponível.
- CI passou e publicou as imagens do Panel e do gateway.

### `5a965a2`

- Normalizador inbound preserva o JID completo em `metadata.jid`, incluindo endereços `@lid`.
- Respostas manuais do Inbox recuperam o JID da última mensagem inbound da conversa.
- Respostas da IA também recuperam esse JID quando não existe override explícito.
- Foram adicionados testes de regressão para normalização e envio Baileys.
- Validação local: `pnpm check`, 56 testes aprovados, `pnpm build` e `git diff --check`.

## Problema restante

O inbound com JID agora foi confirmado no Docker pareado do usuário. A mensagem `id 16` chegou como `inbound`, `provider = baileys` e `metadata.jid = 236450952020113@lid`. Falta confirmar a resposta outbound dessa conversa no celular.

Logs observados:

```text
[forte-worker] processadas=1 enviadas=1 falhas=0 limitadas=0
[forte-worker] eventos=1 entregues=1 falhas=0
```

No gateway:

```text
USync fetch yielded no results for pending PNs
```

Antes da correção, a mensagem outbound era processada e marcada como enviada internamente, mas o destinatário podia não ser resolvido pelo WhatsApp porque o JID era descartado ou porque a conversa antiga não tinha `metadata.jid`. O próximo teste deve usar uma mensagem inbound nova.

### Confirmação do teste inbound após `91a019f`

O usuário atualizou as imagens do Panel e do gateway sem apagar volumes. O readiness voltou como `connected` e a consulta confirmou:

```text
id  | direction | provider | content | jid
16   | inbound   | baileys  | Oi      | 236450952020113@lid
```

Isso confirma que o contrato de JID do webhook e a persistência tenant-aware estão funcionando no ambiente Docker real.

O usuário informou que o último teste não gerou nova mensagem no PostgreSQL nem no Redis. Portanto, antes de outro teste outbound, verificar se uma mensagem inbound nova realmente chegou ao gateway e foi persistida.

## Próximo teste recomendado

### 1. Confirmar conexão

No PowerShell:

```powershell
cd C:\Users\Rafae\Desktop\forte-media
Invoke-RestMethod http://localhost:3010/ready | ConvertTo-Json -Depth 5
```

Esperado:

```text
"status": "connected"
```

### 2. Monitorar logs antes de enviar

Abrir duas janelas PowerShell ou executar rapidamente:

```powershell
docker logs -f forte_media_whatsapp
```

Em outra janela:

```powershell
docker logs -f forte_media_panel
```

### 3. Enviar uma mensagem nova do celular

Do telefone que conversa com `5511999828045`, enviar:

```text
nova conversa jid
```

Não usar uma conversa antiga no Inbox.

### 4. Verificar a mensagem persistida

```powershell
@'
SELECT id, direction, status, provider, content, metadata, "createdAt"
FROM "messages"
ORDER BY id DESC
LIMIT 10;
'@ | docker exec -i forte_media_postgres psql -U forte_panel -d forte_panel
```

Esperado para a nova inbound:

- `direction = inbound`;
- `provider = baileys`;
- `metadata` contendo algo semelhante a:

```json
{"provider":"baileys","messageId":"...","jid":"...@lid"}
```

Se `metadata` não tiver `jid`, a imagem do gateway ou do Panel não foi atualizada corretamente.

### 5. Responder somente a nova conversa

No Inbox, abrir a conversa correspondente à mensagem `nova conversa jid` e enviar:

```text
teste outbound jid novo
```

### 6. Verificar resultado

```powershell
docker logs forte_media_whatsapp --since 1m
docker logs forte_media_worker --since 1m
```

Também consultar o banco:

```powershell
@'
SELECT id, direction, status, provider, content, metadata, "externalId", "lastError", "createdAt"
FROM "messages"
ORDER BY id DESC
LIMIT 10;
'@ | docker exec -i forte_media_postgres psql -U forte_panel -d forte_panel
```

## Comandos de atualização sem perder sessão

Quando uma nova imagem for publicada:

```powershell
cd C:\Users\Rafae\Desktop\forte-media
docker compose --env-file .env pull forte-panel forte-panel-worker forte-whatsapp
docker compose --env-file .env up -d --force-recreate forte-panel forte-panel-worker forte-whatsapp
```

Não executar:

```powershell
docker compose down -v
```

a menos que a intenção seja apagar banco, Redis e sessão do WhatsApp.

## Reset completo apenas se necessário

Para apagar tudo do projeto atual, incluindo sessão e banco:

```powershell
docker compose --env-file .env down -v --remove-orphans
```

Para apagar todos os projetos Docker da máquina, ação destrutiva global:

```powershell
docker rm -f $(docker ps -aq)
docker system prune -a --volumes -f
docker builder prune -a -f
```

Isso não deve ser usado durante o diagnóstico normal.

## `.env` local

O `.env` não deve ser commitado. Variáveis mínimas atuais:

```text
FORTE_API_WORKSPACE_ID=1
BAILEYS_API_KEY=<valor aleatório local>
BAILEYS_WEBHOOK_SECRET=<valor aleatório local>
BAILEYS_INSTANCE_ID=default
BAILEYS_PORT_PUBLIC=3010
```

Não compartilhar os valores das chaves no chat.

## Credenciais de acesso local

No Compose atual, os defaults locais são:

```text
URL: http://localhost:3002
E-mail: admin@fortepanel.local
Senha: trocar-esta-senha
```

Se o usuário alterou `LOCAL_ADMIN_EMAIL` ou `LOCAL_ADMIN_PASSWORD` no `.env`, usar os valores locais configurados.

## Arquivos principais

- `docker-compose.yml`: Compose nativo sem PAPI;
- `FORTE-MEDIA-PROVIDERS.md`: decisão de arquitetura de provedores;
- `server/db.ts`: seleção de provedor e persistência de mensagens;
- `server/integrations/whatsapp.ts`: adapters Baileys/WABA e envio;
- `forte-whatsapp/src/instance-manager.ts`: conexão Baileys, JID e webhook;
- `forte-whatsapp/src/server.ts`: API interna do gateway;
- `server/api.ts`: webhook inbound Baileys;
- `drizzle-pg/0022_conversations_contact_unique.sql`: migration que corrigiu a unicidade inbound.

## Observação para continuidade

A PAPI foi removida da infraestrutura oficial, mas ainda existem rotas e tipos legados no backend para compatibilidade de dados antigos. A remoção completa do código legado deve ser feita depois que Baileys e WABA estiverem estáveis e que não existam workspaces antigos dependentes da PAPI.


---
## Atualização — 2026-09-27 — interface QR e atualização da stack

O caminho operacional atual permanece o gateway Baileys nativo `forte-whatsapp`. O Panel agora expõe a conexão do número dentro de **Integrações**, sem exigir que o usuário final manipule chaves ou endpoints internos.

### Entregas

- Card de QR Code com status `idle`, `connecting`, `qr`, `connected`, `disconnected`, `logged_out` e `error`.
- Polling de status/QR a cada 4 segundos durante o pareamento.
- Ações separadas para desconexão temporária e encerramento da sessão.
- Procedures protegidas: leitura para sessão autenticada; conexão e desconexão para manager/owner.
- Logout do usuário disponível no topo do painel.
- Reset administrativo removido das Preferências comuns; permanece no console de plataforma.
- `scripts/start-docker.sh` atualiza a stack completa (`postgres_panel`, `redis_panel`, `forte-panel`, `forte-panel-worker`, `forte-whatsapp`) sem remover volumes.

### Próximo teste no Windows/PowerShell

```powershell
cd C:\Users\Rafae\Desktop\forte-media
git pull origin main
docker compose --env-file .env pull
docker compose --env-file .env up -d --force-recreate
docker compose --env-file .env ps
```

Depois abrir `http://localhost:3002`, acessar **Integrações**, iniciar o QR e validar uma mensagem inbound nova antes do teste outbound. Não usar `down -v` durante a validação normal.
