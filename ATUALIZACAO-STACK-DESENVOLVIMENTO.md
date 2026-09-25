# Atualização da stack — PAPI + Forte Panel com agente nativo

A arquitetura operacional agora é:

```text
WhatsApp → PAPI → webhook do Forte Panel → PostgreSQL/worker → agente nativo → ferramentas do Forte Panel → fila → PAPI → WhatsApp
```

O **n8n foi retirado do fluxo**. O Forte Panel concentra contatos, conversas, deduplicação, idempotência, controle humano, debounce, memória do lead, agenda, system prompt, ferramentas do agente e envio.

## Arquivos principais

- `docker-compose.yaml`: compose final com PAPI, seus bancos, Forte Panel e worker.
- `docker-compose.forte-panel-papi.yaml`: cópia explícita do compose sem serviço n8n; o container e os volumes antigos do n8n não são declarados nem alterados.
- `.env.forte-panel-papi.example`: modelo seguro do ambiente; preserve o `.env` atual para manter as credenciais existentes.
- `.env`: configurações e credenciais da sua stack; não publique este arquivo.
- `.env.stack.example`: referência sem segredos.
- `server/native-agent.ts`: execução do agente e tools nativas.
- `ATUALIZACAO-STACK-DESENVOLVIMENTO.md`: este procedimento.

Os arquivos em `infra/n8n/` e o `.tgz` do community node são históricos da etapa de desenvolvimento e não devem ser instalados nesta etapa. O n8n existente pode continuar parado ou ligado: este compose não executa `pull`, `stop`, `rm` ou `down` nele.

## 1. Backup e atualização

Na pasta da stack, faça backup do compose e do banco do Panel:

```powershell
docker compose ps
docker compose exec -T postgres_panel pg_dump -U forte_panel -d forte_panel > forte_panel_backup.sql
Copy-Item .\docker-compose.yaml .\docker-compose.before-native-agent.yaml
```

Não use `docker compose down -v`: o `-v` remove volumes e dados.

O reset disponível em **Configurações → Limpeza de desenvolvimento** apaga somente os registros do workspace do Forte Panel, depois de exigir a frase `APAGAR DADOS DO FORTE PANEL` e uma confirmação do navegador. Ele não toca em nenhum container, volume ou banco do n8n.

Copie o `docker-compose.yaml` final e mantenha o `.env` existente. Os volumes continuam sendo `postgres_papi_data`, `redis_papi_data`, `pastorini_sessions`, `pastorini_media`, `postgres_panel_data` e `redis_panel_data`.

## 2. Configuração do modelo

As credenciais dos modelos são cadastradas na interface. O `.env` deve manter as credenciais atuais da PAPI e da infraestrutura; não copie um `.env` de exemplo por cima do seu arquivo real.

O arquivo `.env.forte-panel-papi.example` documenta os nomes esperados sem conter segredos. O arquivo `.env` real não deve ser publicado.

## 3. Recriar os serviços sem apagar dados

```powershell
docker compose pull pastorini_api forte-panel forte-panel-worker
docker compose up -d --force-recreate pastorini_api forte-panel forte-panel-worker
docker compose ps
docker compose logs --tail=120 forte-panel forte-panel-worker
```

O comando não recria os bancos nem o Redis. O worker não deve mais procurar `N8N_EVENTS_WEBHOOK_URL`.

## 4. Webhook do Forte Panel na PAPI

O endpoint é fornecido pelo Forte Panel. Na PAPI, remova o webhook antigo e cadastre:

```text
https://SEU_DOMINIO_DO_PANEL/api/v1/webhooks/providers/papi
```

Ou, se a porta estiver publicada diretamente:

```text
http://SEU_IP_OU_DOMINIO:3002/api/v1/webhooks/providers/papi
```

Configure na PAPI o header:

```text
X-PAPI-Webhook-Secret: valor_de_PAPI_WEBHOOK_SECRET
```

O Panel normaliza o evento PAPI, evita duplicação, cria ou reutiliza contato/conversa, salva a mensagem e responde `202` quando aceita.

## 5. Configurar o agente na interface

1. Abra **Sistema → Configuração da empresa**.
2. Confirme **Credencial de IA: configurada**.
3. Escolha o modelo.
4. Publique o perfil da empresa.
5. Escreva um system prompt próprio se quiser substituir o prompt operacional publicado.
6. Deixe **Agente ativo** selecionado.

O agente possui ferramentas para consultar/atualizar leads, registrar notas, consultar agenda, criar agendamento, enviar mensagem e transferir para humano.

## 6. Regras nativas

- Mensagens do proprietário (`fromMe`) são registradas e não geram resposta automática.
- IA pausada ou conversa sob controle humano não dispara o agente.
- Mensagens próximas são agrupadas pelo debounce configurado em `AGENT_DEBOUNCE_MS`.
- A resposta é enfileirada no PostgreSQL e enviada pelo worker através do provedor padrão, atualmente PAPI.
- O histórico e as configurações persistem no PostgreSQL; não dependem do n8n.

## 7. Teste controlado

1. Envie uma mensagem de teste pelo WhatsApp.
2. Confira se foi criado apenas um contato e uma conversa.
3. Confira a mensagem no **Atendimento**.
4. Verifique os logs do worker.
5. Peça ao agente disponibilidade e depois um agendamento.
6. Desative **Agente ativo** e confirme que a entrada é armazenada sem resposta.
7. Reative o agente.
8. Envie uma resposta manual pelo celular e confirme que o controle humano foi aplicado.

Se a credencial estiver vazia, o Panel continuará recebendo e persistindo mensagens, mas não conseguirá gerar respostas até a chave ser configurada.

## 8. Rollback

Se precisar voltar ao compose anterior, pare somente os serviços da aplicação, restaure o arquivo e suba novamente. Não remova volumes:

```powershell
docker compose stop forte-panel forte-panel-worker pastorini_api
Copy-Item .\docker-compose.before-native-agent.yaml .\docker-compose.yaml -Force
docker compose up -d pastorini_api forte-panel forte-panel-worker
```
