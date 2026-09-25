# Workflow n8n integrado ao Forte Panel

O export preparado em `infra/n8n/forte-panel-workflow.json` foi criado como cópia do workflow fornecido; o arquivo original não é alterado. Ele mantém as ramificações de controle humano, debounce, memória curta, modelo, áudio e botões, mas remove a antiga subworkflow `Lead Memory Tool` e usa o Forte Panel como fonte única do CRM.

Para adaptar uma exportação posterior do mesmo workflow, rode `node scripts/adapt-n8n-workflow.mjs <workflow-export.json> [workflow-adaptado.json]` na raiz do repositório. O script interrompe se não encontrar os nodes e as seções de prompt esperados, em vez de gravar uma migração parcial.

## Importação e credenciais

Importe o JSON no n8n. Associe a credencial existente **Forte Panel API** ao node AI Tool **Forte Panel**. Nos cinco nodes HTTP de integração, crie/associe uma credencial **HTTP Bearer Auth** cujo token seja o mesmo valor configurado no servidor como `FORTE_API_KEY`. Não grave a chave diretamente em parâmetros, expressions, workflow JSON ou Git.

O host configurado nos nodes é `http://forte-panel:3000`, nome do serviço Compose e porta interna quando n8n e Forte Panel compartilham a mesma rede Docker. Se os containers estiverem em redes diferentes, publique o Panel por um proxy HTTPS e altere os URLs para o domínio protegido.

## Entrada PAPI → Inbox → AI Agent

O node `Limpeza` identifica o `messageId`, a instância, o remetente, o texto, o tipo de conteúdo e dados de mídia. O `Filtro entrada Inbox` deixa apenas eventos `lead_message` seguirem para `POST /api/v1/webhooks/inbound/whatsapp`; controles humanos e eventos fromMe não viram mensagem inbound. O fluxo só continua ao processamento do agente após o webhook retornar sucesso.

O `eventId` enviado ao painel combina `instanceId` e `messageId`. Ele é usado no cabeçalho `Idempotency-Key` e persistido como `externalId`, impedindo uma segunda linha caso o PAPI/n8n repita uma entrega. O webhook recebe texto ou placeholder de mídia junto com metadados como URL, MIME, nome, tamanho e resposta de botão; o payload base64 completo não é enviado para não inflar o banco.

## Saída AI Agent → worker → PAPI

Os nodes de texto, áudio PTT e botões chamam `POST /api/v1/messages`, com `Idempotency-Key` derivada da mensagem inbound e da posição da resposta. O servidor registra como `senderType: "ai"`, para não pausar o bot nem ativar controle humano, e enfileira a mensagem. Cada request repassa o `instanceId` da conversa.

| Tipo | `content` | Metadados enviados |
|---|---|---|
| Texto | Conteúdo da mensagem | Nenhum |
| Áudio | URL da mídia | `{ "ptt": true }` |
| Botões | Texto do corpo | `{ "buttons": [{ "id": "agendar", "displayText": "Agendar" }] }` |

A URL de áudio deve ser acessível **pelo container do PAPI**. No fluxo, os botões são limitados a três, que é o máximo aceito pelo adapter deste worker. `queued` significa que a API aceitou o job; o worker atualiza o estado de entrega depois de chamar o provedor.

## Validação após importação

Antes de ativar o fluxo de produção, execute um teste com uma conversa de teste e confirme: (1) mensagem recebida aparece uma vez na Inbox; (2) a resposta de texto aparece no histórico e sai pelo PAPI; (3) áudio PTT com uma URL acessível pelo PAPI; e (4) um botão é visível na conversa e é entregue pelo canal. O envio de imagem, vídeo e documento ainda não é suportado pelo worker; esses tipos podem ser recebidos e guardados no histórico.

O fallback de `Preparar Debounce` também usa a API do panel. A integração grava o estado no Forte Panel; o Postgres Chat Memory permanece apenas como memória curta do diálogo. O PAPI pode executar um envio e perder a resposta HTTP, portanto a chave idempotente impede duplicação no worker do painel, mas não pode assegurar exactly-once dentro do provedor em um timeout ambíguo.

## Instalação Docker do community node

A imagem `infra/n8n/Dockerfile` instala o pacote local. Na raiz do repositório:

```bash
docker build -f infra/n8n/Dockerfile -t forte-n8n:local .
```

No serviço `n8n` do Compose, use `forte-n8n:local` e configure:

```yaml
environment:
  N8N_CUSTOM_EXTENSIONS: /opt/n8n-custom-nodes/node_modules/n8n-nodes-forte-panel
  N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE: "true"
```

Depois recrie somente o n8n:

```bash
docker compose up -d --no-deps --force-recreate n8n
docker compose logs -f n8n
```

A instalação inclui o pacote do node, mas não migra credenciais salvas dentro do n8n. Preserve o volume persistente `n8n_data` ao recriar o container.

## Chamada HTTP inbound (equivalente fora do export)

```http
POST /api/v1/webhooks/inbound/whatsapp
Authorization: Bearer <FORTE_API_KEY>
Idempotency-Key: <instanceId>:<messageId>
Content-Type: application/json
```

```json
{
  "eventId": "instance-01:message-id",
  "phone": "5511999999999",
  "content": "Olá, gostaria de agendar",
  "messageType": "text",
  "receivedAt": "2026-09-24T12:00:00.000Z",
  "metadata": { "instanceId": "instance-01" }
}
```

## Chamada HTTP de saída (equivalente fora do export)

```http
POST /api/v1/messages
Authorization: Bearer <FORTE_API_KEY>
Idempotency-Key: <chave-estável-para-esta-resposta>
Content-Type: application/json
```

```json
{
  "phone": "5511999999999",
  "content": "Como posso ajudar?",
  "provider": "papi",
  "senderType": "ai",
  "messageType": "button",
  "instanceId": "instance-01",
  "metadata": {
    "buttons": [{ "id": "agendar", "displayText": "Agendar" }]
  }
}
```

A API registra o evento como `queued`, não como entregue. Em operações mutáveis, retries devem reutilizar a mesma chave e exatamente o mesmo payload.

## References

O workflow PAPI foi verificado contra o pacote `n8n-nodes-papi` versão `1.2.0`, que implementa o node Pastorini usado no export [1] [2]. Seus endpoints não foram inferidos da Evolution API, que tem contrato diferente. O PAPI Docker local do workflow também é distinto do serviço SaaS homônimo. Consulte a [API_CONTRACT.md](../API_CONTRACT.md) e o guia [N8N_COMMUNITY_NODE.md](N8N_COMMUNITY_NODE.md).

[1]: https://www.npmjs.com/package/n8n-nodes-papi "Pacote n8n-nodes-papi no npm"
[2]: https://github.com/mktpastorini/papi "Repositório do node PAPI de Pastorini"
