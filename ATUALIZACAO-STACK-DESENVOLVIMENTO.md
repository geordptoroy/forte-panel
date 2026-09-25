# Atualização da stack — estado atual de desenvolvimento

Esta atualização mantém o n8n temporariamente no fluxo, mas remove os nodes PAPI do workflow. Durante esta fase:

```text
PAPI atual → webhook do Forte Panel → Forte Panel → webhook do Trigger comunitário do n8n → AI Agent → Forte Panel Send → Forte Panel Worker → PAPI atual
```

O Forte Panel é quem fornece o endpoint de entrada. Você apenas copia essa URL e cola na configuração de webhook da PAPI. O Forte Panel não cria webhook dentro da PAPI por API nesta fase, porque isso não é necessário e evita acoplamento ao painel da PAPI.

## Webhook de entrada gerado pelo Forte Panel

O endpoint do Forte Panel é:

```text
http://forte-panel:3000/api/v1/webhooks/providers/papi
```

Se o painel/PAPI estiverem fora da mesma rede Docker, use o endereço público do Forte Panel:

```text
https://SEU_DOMINIO/api/v1/webhooks/providers/papi
```

Na tela da PAPI, crie ou edite o webhook de mensagens e cole a URL acima. Mantenha o evento de mensagens e habilite o envio de mensagens do proprietário (`sendFromMe: true`). Se a PAPI permitir headers, envie `X-PAPI-Webhook-Secret` com o mesmo valor de `PAPI_WEBHOOK_SECRET` do `.env`.

Esse é o único cadastro manual na PAPI. A PAPI chama o endpoint do Panel; o Panel normaliza, deduplica, salva o contato/conversa, aplica o controle humano e só então chama o n8n quando a IA estiver ativa.

## Arquivos

- `docker-compose.current-dev.yml`: compose atualizado, sem apagar volumes.
- `.env.stack.example`: modelo do `.env` usado pelo compose; copie para `.env` e preencha os segredos.
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

## 2. Configurar o `.env` e copiar o compose

Coloque `.env.stack.example` na mesma pasta do compose, renomeie para `.env` e substitua todos os valores `TROQUE_*` por valores reais. O Compose carrega automaticamente esse `.env`; não deixe senhas ou license key dentro do YAML.

No PowerShell:

```powershell
Copy-Item .\.env.stack.example .\.env
notepad .\.env
```

Depois substitua o arquivo da stack pelo `docker-compose.current-dev.yml`, mantendo uma cópia do compose anterior:

```powershell
Copy-Item .\docker-compose.yml .\docker-compose.before-forte-panel-dev.yml
Copy-Item .\docker-compose.current-dev.yml .\docker-compose.yml -Force
docker compose config --quiet
```

Se a validação reclamar de uma variável, volte ao `.env` e preencha o nome indicado. Isso é intencional: a stack não inicia com segredo ausente.

O compose atualizado mantém os volumes existentes, lê os segredos do `.env`, adiciona a chave de criptografia persistente do n8n e configura:

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

## 5. Importar o workflow e conectar o n8n temporário

1. Abra o n8n.
2. Importe `forte-panel-workflow-dev.json` como um workflow novo.
3. Abra o node **Forte Panel — Receber evento**. Esse é um segundo webhook, interno, usado somente para o Panel entregar eventos ao n8n durante o desenvolvimento. Ele não é o webhook que você cola na PAPI.
4. Ative o workflow para o n8n registrar a URL de produção:

```text
http://SEU_HOST_N8N:5678/webhook/forte-panel-event
```

5. No serviço `forte-panel` e no `forte-panel-worker`, `N8N_EVENTS_WEBHOOK_URL` deve apontar para o webhook do node acima. Dentro da mesma rede Docker, o padrão já é:

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
