# Nós HTTP do Forte Panel no workflow n8n

O JSON exportado do workflow original não está dentro do repositório; por isso este guia descreve as chamadas exatas que devem substituir o Clientverse sem alterar o restante do agente.

## Credencial

Crie uma credencial de Header Auth no n8n com:

```text
Authorization: Bearer {{$env.FORTE_API_KEY}}
```

O host deve ser o nome do serviço na rede Docker, por exemplo `http://forte-panel:3000`.

## 1. Depois de `Limpeza`: registrar mensagem recebida

Adicione um nó **HTTP Request**:

```text
Method: POST
URL: http://forte-panel:3000/api/v1/webhooks/inbound/whatsapp
Authentication: Header Auth
Header: Idempotency-Key = {{$json.eventId}}
Body Content Type: JSON
```

Body:

```json
{
  "eventId": "={{$json.eventId || $json.id}}",
  "phone": "={{String($json.phone || $json.from || '').replace(/\\D/g, '')}}",
  "name": "={{$json.name || $json.pushName || 'Cliente'}}",
  "content": "={{$json.content || $json.text || $json.body || '[mídia recebida]'}}",
  "messageType": "={{$json.messageType || 'text'}}",
  "receivedAt": "={{$now.toISO()}}"
}
```

Esse nó deve ser colocado depois que o workflow já tiver normalizado texto, telefone e tipo de mídia. O `eventId` impede duplicação.

## 2. Substituir `Lead Memory Tool` / Clientverse

Use quatro nós HTTP ou um nó com o `action` dinâmico:

```text
Method: POST
URL: http://forte-panel:3000/api/v1/lead-memory
Authentication: Header Auth
Header: Idempotency-Key = forte-lead-{{$json.phone}}-{{$execution.id}}-{{$json.action}}
Body Content Type: JSON
```

Buscar:

```json
{
  "action": "buscar_lead",
  "phone": "={{String($json.phone).replace(/\\D/g, '')}}"
}
```

Criar/atualizar:

```json
{
  "action": "={{$json.action}}",
  "phone": "={{String($json.phone).replace(/\\D/g, '')}}",
  "name": "={{$json.name}}",
  "fields": {
    "city": "={{$json.city}}",
    "neighborhood": "={{$json.neighborhood}}",
    "serviceRequested": "={{$json.serviceRequested}}",
    "urgency": "={{$json.urgency}}",
    "stage": "={{$json.stage}}",
    "quoteCents": "={{$json.quoteCents}}",
    "aiEnabled": "={{$json.aiEnabled !== false}}"
  }
}
```

Nota interna:

```json
{
  "action": "registrar_nota",
  "phone": "={{String($json.phone).replace(/\\D/g, '')}}",
  "note": "={{$json.note}}"
}
```

O retorno mantém `success`, `acao`, `telefone`, `resultado` e `mensagem`, então o agente pode continuar usando o mesmo formato sem acessar banco externo.

## 3. Prompt operacional publicado

Antes de montar a mensagem do agente, adicione um **HTTP Request** de leitura:

```text
Method: GET
URL: http://forte-panel:3000/api/v1/onboarding/prompt
Authentication: Header Auth
```

Use `{{$json.data.prompt}}` como instrução de negócio publicada. Se `data.published` for `false`, o fluxo deve usar um comportamento seguro e encaminhar a configuração para revisão humana, sem inventar preço, horário ou política.

## 4. Agenda

Troque a ferramenta antiga por:

```text
GET  http://forte-panel:3000/api/v1/availability
POST http://forte-panel:3000/api/v1/appointments
```

Para mutações, sempre enviar `Idempotency-Key`. Conflito de horário retorna HTTP `409`; o agente deve informar que aquele horário não está disponível e consultar outra opção.

## 5. Envio de resposta

Durante o primeiro teste local, mantenha os nós de envio da PAPI já existentes para não alterar o fluxo validado. Quando o worker do Panel for o responsável pelo envio, use:

```text
POST http://forte-panel:3000/api/v1/messages
```

Body:

```json
{
  "contactId": "={{$json.contactId}}",
  "content": "={{$json.response}}",
  "provider": "papi"
}
```

A resposta `202` com `status: queued` significa apenas que o worker aceitou a mensagem. O workflow não deve tratá-la como entregue antes de existir confirmação do provedor.
