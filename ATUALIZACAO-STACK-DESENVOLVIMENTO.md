# Atualização da stack — estado atual de desenvolvimento

Esta atualização mantém o n8n temporariamente no fluxo, mas remove os nodes PAPI do workflow. Durante esta fase:

```text
PAPI atual → webhook existente → Forte Panel → Trigger comunitário do n8n → AI Agent → Forte Panel Send → Forte Panel Worker → PAPI atual
```

O webhook automático da PAPI **não é configurado nesta etapa**. A URL PAPI existente continua sendo usada apenas para a entrada que você já possui.

## Alteração manual obrigatória no webhook já existente

O workflow novo não possui mais `PAPI Trigger`. Portanto, edite manualmente o webhook que já está configurado na PAPI e troque somente a URL de destino para:

```text
http://forte-panel:3000/api/v1/webhooks/providers/papi
```

Se a PAPI estiver fora da rede Docker, use a URL pública do Forte Panel:

```text
https://SEU_DOMINIO/api/v1/webhooks/providers/papi
```

Mantenha o evento de mensagens e habilite o envio de mensagens do proprietário (`sendFromMe: true`). Se você configurar o segredo, envie o header `X-PAPI-Webhook-Secret` com o mesmo valor de `PAPI_WEBHOOK_SECRET` do compose.

Essa é uma alteração manual do webhook existente; nenhum código ou comando desta atualização cria webhook na PAPI.

## Arquivos

- `docker-compose.current-dev.yml`: compose atualizado, sem apagar volumes.
- `n8n-nodes-forte-panel-0.7.0.tgz`: pacote do community node.
- `infra/n8n/forte-panel-workflow-dev.json`: workflow atualizado.
- `infra/n8n/forte-panel-agent-prompt.yaml`: prompt YAML do AI Agent.

## 1. Backup antes da alteração

No PowerShell, na pasta onde está o compose atual:

```powershell
docker compose ps
docker volume ls
docker compose exec -T postgres_panel pg_dump -U forte_panel -d forte_panel > forte_panel_backup.sql
```

Não use:

```powershell
docker compose down -v
```

O `-v` apagaria os volumes e os dados.

## 2. Copiar o compose

Substitua o arquivo da stack pelo arquivo `docker-compose.current-dev.yml`, mantendo uma cópia do compose anterior:

```powershell
Copy-Item .\docker-compose.yml .\docker-compose.before-forte-panel-dev.yml
Copy-Item .\docker-compose.current-dev.yml .\docker-compose.yml -Force
docker compose config --quiet
```

O compose atualizado mantém os volumes existentes e adiciona:

```env
N8N_DEBOUNCE_MS=1500
```

Para alterar para 3 segundos, crie ou edite o `.env` da stack:

```env
N8N_DEBOUNCE_MS=3000
```

## 3. Instalar o community node 0.7.0 no n8n

Coloque o arquivo `.tgz` na mesma pasta do PowerShell:

```powershell
docker cp .\n8n-nodes-forte-panel-0.7.0.tgz n8n:/tmp/n8n-nodes-forte-panel-0.7.0.tgz
```

Remova somente a instalação anterior do pacote e instale a nova. Isso não remove o volume nem os workflows do n8n:

```powershell
docker exec -u node n8n sh -lc "rm -rf /home/node/.n8n/nodes/node_modules/n8n-nodes-forte-panel; mkdir -p /home/node/.n8n/nodes; npm install --prefix /home/node/.n8n/nodes --omit=dev /tmp/n8n-nodes-forte-panel-0.7.0.tgz"
```

Reinicie somente o n8n:

```powershell
docker restart n8n
```

Confirme que o pacote foi instalado:

```powershell
docker exec -u node n8n sh -lc "node -p \"require('/home/node/.n8n/nodes/node_modules/n8n-nodes-forte-panel/package.json').version\""
```

O retorno esperado é:

```text
0.7.0
```

## 4. Recriar somente os serviços atualizados

Depois da instalação do node:

```powershell
docker compose up -d --no-deps --force-recreate n8n forte-panel forte-panel-worker
```

Acompanhe os logs:

```powershell
docker compose logs -f --tail=100 n8n forte-panel forte-panel-worker
```

Não recrie `postgres_papi`, `postgres_n8n`, `postgres_panel`, `redis_papi`, `redis_panel` ou `pastorini_api` se eles já estiverem funcionando.

## 5. Importar o workflow

1. Abra o n8n.
2. Importe `forte-panel-workflow-dev.json` como um workflow novo.
3. Abra o node **Forte Panel — Receber evento**.
4. Ative o workflow para o n8n registrar a URL de produção:

```text
http://SEU_HOST_N8N:5678/webhook/forte-panel-event
```

5. No serviço `forte-panel` e no `forte-panel-worker`, configure `N8N_EVENTS_WEBHOOK_URL` com essa URL se ela for diferente do padrão interno:

```env
N8N_EVENTS_WEBHOOK_URL=http://n8n:5678/webhook/forte-panel-event
```

6. A credencial do node **Forte Panel Tool** e do node **Forte Panel — Enviar mensagens** deve apontar para:

```text
http://forte-panel:3000/api/v1
```

7. Use a mesma chave do `FORTE_API_KEY` configurado no serviço `forte-panel`.

## 6. Prompt YAML

O arquivo `forte-panel-agent-prompt.yaml` contém o prompt atual e a política da fase de desenvolvimento. Para atualizar somente o campo **System Message** do node AI Agent, copie o conteúdo abaixo de `system_message: |-`, removendo os dois espaços iniciais de cada linha.

Não cole o cabeçalho YAML inteiro dentro do campo System Message.

## 7. O que foi removido do workflow

O workflow novo não contém:

- `PAPI Trigger`;
- nodes `n8n-nodes-papi`;
- `Registrar entrada Forte Panel` via HTTP;
- nodes HTTP para envio;
- loop manual de envio;
- `SendText`, `SendAudio` e `SendButtons` individuais.

Ele usa:

- **Forte Panel — Receber evento**;
- **Forte Panel Tool**;
- **Forte Panel — Enviar mensagens**;
- worker do Forte Panel para encaminhar pela PAPI.

## 8. Teste controlado

Faça primeiro um teste com um contato de teste:

1. Envie uma mensagem de texto pelo WhatsApp.
2. Verifique se o Forte Panel cria apenas um contato e uma conversa.
3. Verifique se o evento chega ao node **Forte Panel — Receber evento**.
4. Verifique se o AI Agent recebe `payload.content` e `payload.messages`.
5. Verifique se o node **Forte Panel — Enviar mensagens** aceita o lote.
6. Verifique no Inbox/Atendimento se a resposta fica registrada como outbound.
7. Confirme no WhatsApp se a PAPI entregou a resposta.
8. Envie uma resposta manual pelo celular e confirme que ela fica como `human` e não chama o AI Agent.

## 9. Rollback sem apagar dados

Se precisar voltar ao workflow anterior:

```powershell
docker compose stop n8n forte-panel forte-panel-worker
Copy-Item .\docker-compose.before-forte-panel-dev.yml .\docker-compose.yml -Force
docker compose up -d n8n forte-panel forte-panel-worker
```

Os volumes não são removidos.
