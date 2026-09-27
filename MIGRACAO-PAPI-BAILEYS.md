# Migração de PAPI para Baileys nativo

**Data:** 2026-09-26  
**Status:** Baileys é o canal WhatsApp local ativo do Forte Panel. A migração operacional foi concluída; hardening de produção e paridade de interface continuam em andamento.

> Este documento descreve o estado atual do código. Para a sequência de produto, gates e pendências por fase, consulte `AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md`.

## Decisão

A PAPI deixou de ser o caminho operacional do Forte Panel. O envio e o recebimento locais passam pelo serviço original `forte-whatsapp`, implementado diretamente sobre Baileys.

A API oficial da Meta Cloud permanece opcional como segundo canal. Ela não é necessária para a operação local com QR Code.

> Baileys usa o protocolo de dispositivos vinculados do WhatsApp Web. Não é a WhatsApp Business Platform oficial. O uso deve ser legítimo, com baixo volume, opt-in e sem spam ou automação abusiva.

## Arquitetura atual

```text
WhatsApp Web
    ↓ sessão persistente / QR
forte-whatsapp (Baileys)
    ├── POST /api/instances/:instanceId/send
    ├── POST /api/instances/:instanceId/send-text
    └── webhook assinado
            ↓
Forte Panel /api/v1/webhooks/providers/baileys
            ↓
PostgreSQL → Inbox → agente nativo → fila outbound
            ↓
forte-whatsapp → WhatsApp
```

## Configuração do Compose

O serviço `forte-whatsapp` usa estas variáveis:

```env
BAILEYS_API_KEY=<segredo-da-api-interna>
BAILEYS_WEBHOOK_SECRET=<segredo-do-webhook>
BAILEYS_INSTANCE_ID=default
BAILEYS_PORT_PUBLIC=3010
```

O Panel e o worker recebem internamente:

```env
BAILEYS_BASE_URL=http://forte-whatsapp:3010
BAILEYS_API_KEY=${BAILEYS_API_KEY}
BAILEYS_WEBHOOK_SECRET=${BAILEYS_WEBHOOK_SECRET}
BAILEYS_INSTANCE_ID=${BAILEYS_INSTANCE_ID:-default}
```

A sessão é mantida no volume montado em `/app/sessions`. Não apagar esse volume se a intenção for preservar o pareamento.

## Pareamento

1. Subir `forte-whatsapp` e o Panel.
2. Abrir o endpoint autenticado de QR do gateway:
   `GET /api/instances/default/qr`
3. Ler o QR retornado em `imageDataUrl`.
4. No celular, abrir **WhatsApp → Dispositivos conectados → Conectar dispositivo**.
5. Escanear o QR.
6. Confirmar `GET /ready` até o status da instância ficar `connected`.

O gateway inicia a conexão automaticamente. Se a sessão for encerrada ou desconectada sem logout, ele tenta reconectar. O endpoint `logout` apaga a sessão lógica e exige novo pareamento.

## Tipos de envio

O contrato interno do worker é `OutboundMessageCommand`. O campo `messageType` suporta:

| Tipo | `content` | Metadados principais |
|---|---|---|
| `text` | Texto da mensagem | — |
| `audio` | URL acessível pelo gateway | `ptt`, `mimetype` |
| `image` | URL da imagem | `caption`, `mimetype` |
| `video` | URL do vídeo | `caption`, `mimetype`, `ptv` |
| `document` | URL do arquivo | `fileName`, `mimetype` |
| `button`/interativo | Texto do corpo ou payload Baileys | `buttons`, `footer` e campos compatíveis |

O gateway também aceita o payload genérico compatível com `AnyMessageContent` para tipos avançados. A interface ainda precisa oferecer composer específico para todos esses tipos; “payload aceito no gateway” não significa que a experiência completa já esteja disponível no Inbox.

O endpoint genérico do gateway é:

```http
POST /api/instances/default/send
Authorization: Bearer <BAILEYS_API_KEY>
Idempotency-Key: forte-message-123
Content-Type: application/json
```

Exemplo de texto:

```json
{
  "jid": "5511999999999@s.whatsapp.net",
  "messageType": "text",
  "content": "Olá!"
}
```

Exemplo de áudio/voz:

```json
{
  "jid": "5511999999999@s.whatsapp.net",
  "messageType": "audio",
  "content": "https://cdn.example.com/audio.ogg",
  "metadata": { "ptt": true, "mimetype": "audio/ogg; codecs=opus" }
}
```

Exemplo de botões:

```json
{
  "jid": "5511999999999@s.whatsapp.net",
  "messageType": "button",
  "content": "Como posso ajudar?",
  "metadata": {
    "footer": "Forte Panel",
    "buttons": [
      { "id": "orcamento", "displayText": "Solicitar orçamento" },
      { "id": "humano", "displayText": "Falar com atendente" }
    ]
  }
}
```

Os JIDs completos são preservados em `metadata.jid`, incluindo endereços `@lid` quando o WhatsApp os fornece. Isso evita que respostas sejam roteadas para um número incorreto.

## API REST do Panel

`POST /api/v1/messages` e `POST /api/v1/messages/batch` aceitam:

```json
{
  "contactId": 123,
  "provider": "baileys",
  "messageType": "text | image | audio | video | document | button",
  "content": "texto ou URL da mídia",
  "metadata": {}
}
```

O provider padrão do workspace agora é `baileys` quando nenhuma seleção explícita válida existe. A fila grava o provider, o tipo, o JID e os metadados antes do envio. O worker só marca a mensagem como `sent` depois da confirmação do gateway.

Chamadas recebidas são registradas como eventos inbound com metadata de chamada. Iniciar uma chamada não é tratado como mensagem comum e continua fora do contrato de envio até existir um fluxo de signaling próprio.

## Interface

A tela **Sistema → Conectividade** agora mostra:

- Baileys nativo como canal local;
- seleção de Baileys ou Meta Cloud API;
- estado de configuração do gateway;
- instância padrão;
- tipos de envio suportados;
- consumo e proteções do workspace.

As telas de provisionamento, webhooks, API keys e instâncias PAPI foram retiradas da interface. A tela do agente também não exibe mais credencial PAPI.

## Limpeza de ambiente

Remover do `.env` e dos arquivos de implantação antigos, quando existirem:

```env
PAPI_BASE_URL
PAPI_API_KEY
PAPI_INSTANCE_ID
PAPI_WEBHOOK_SECRET
PAPI_LICENSE_KEY
PAPI_POSTGRES_PASSWORD
PAPI_REDIS_PASSWORD
PAPI_CLOUD_PANEL_TOKEN
```

Não remover `BAILEYS_API_KEY`, `BAILEYS_WEBHOOK_SECRET` nem o volume de sessão do gateway.

## Migração de dados legados

As tabelas históricas e o enum PostgreSQL podem conter registros `papi` antigos. Eles não são mais selecionáveis pelo painel nem usados como provider padrão. Mensagens históricas permanecem no Inbox para auditoria. O adapter interno legado ainda é mantido temporariamente para drenar uma mensagem PAPI que já estivesse `queued` antes da migração; ele não é exposto por rota, interface ou seleção de workspace.

Antes de apagar tabelas ou registros legados em produção:

1. fazer backup do PostgreSQL;
2. confirmar que não há mensagens `queued` com provider PAPI;
3. confirmar que todos os workspaces têm canal Baileys configurado;
4. remover os containers e volumes da stack antiga somente após validar o novo gateway.

## Operação e segurança

- Nunca registrar QR, credenciais ou chaves Signal nos logs.
- Manter `BAILEYS_API_KEY` apenas entre Panel/worker e gateway.
- Validar o webhook com `BAILEYS_WEBHOOK_SECRET` e assinatura HMAC.
- Evitar grupos no primeiro ciclo operacional; a ingestão atual ignora grupos.
- Monitorar desconexões, erros de envio e mensagens `failed` na fila.
- Para produção em escala, substituir o armazenamento de sessão baseado em arquivos por um store durável e criptografado em banco, conforme a recomendação do próprio ecossistema Baileys.
- Respeitar termos do WhatsApp, privacidade, consentimento e limites de uso.

## Validação desta migração

- Gateway: `npm run check`, `npm test`, `npm run build`.
- Panel: `pnpm check`, `pnpm test`, `pnpm build`.
- Verificar `git diff --check`.
- Testar QR, inbound de texto, resposta do agente, outbound manual, áudio, imagem, vídeo, documento e botões com um número de teste.
