# Mensagens interactivas WhatsApp no Forte Panel

O provider operacional continua a ser apenas **Baileys**, através do gateway `forte-whatsapp`. A camada suporta quatro famílias de mensagens interactivas: botões Native Flow, listas, enquetes e carrosséis. O Pix nativo tem um guia específico em [`WHATSAPP-PIX-NATIVO.md`](WHATSAPP-PIX-NATIVO.md).

## Endpoints

A aplicação recebe mensagens no endpoint autenticado `POST /api/messages`. O gateway recebe o envio final em `POST /api/instances/<INSTANCE_ID>/send`, com `Authorization: Bearer <GATEWAY_API_KEY>` e uma `Idempotency-Key` única. Para envelopes Native Flow que não têm texto, usar o campo `payload` no endpoint do gateway; isto evita inserir um carácter invisível no corpo e evita o `?` no rodapé.

## Botões

Para botões comuns, enviar `messageType: "button"`, conteúdo textual e `metadata.buttons`. O gateway transforma cada opção em `quick_reply`, aceita até dez botões e preserva botões avançados quando cada item já contém `name` e `buttonParamsJson`.

```json
{
  "phone": "<E164>",
  "content": "Escolha uma opção",
  "messageType": "button",
  "metadata": {
    "buttons": [
      { "buttonId": "yes", "buttonText": { "displayText": "Sim" } },
      { "buttonId": "no", "buttonText": { "displayText": "Não" } }
    ]
  }
}
```

Para copiar conteúdo, o gateway aceita a forma `cta_copy` com `copy_code`. Para URLs, o Native Flow usa `cta_url` com `display_text` e `url`. Botões antigos `buttonsMessage` não são usados.

## Listas

A lista usa Native Flow `single_select` no gateway actual. O contrato exige pelo menos uma secção. Cada secção pode conter `title` e `rows`; cada linha deve ter um identificador e um título. O envelope legado `listMessage` continua disponível internamente apenas como compatibilidade de transporte/fallback, não como a opção principal.

```json
{
  "phone": "<E164>",
  "content": "Escolha um serviço",
  "messageType": "list",
  "metadata": {
    "buttonText": "Ver opções",
    "sections": [
      {
        "title": "Serviços",
        "rows": [
          { "id": "support", "title": "Suporte", "description": "Ajuda" },
          { "id": "sales", "title": "Vendas" }
        ]
      }
    ]
  }
}
```

A lista pode ser entregue pelo WhatsApp mas não renderizar em todos os clientes. Quando a compatibilidade visual for essencial, preferir botões ou carrossel.

## Enquetes

A enquete usa o tipo nativo Baileys `poll`. Exige um nome e pelo menos duas opções. `selectableCount` é opcional e, por omissão, vale um.

```json
{
  "phone": "<E164>",
  "content": "Qual opção prefere?",
  "messageType": "poll",
  "metadata": {
    "payload": {
      "poll": {
        "name": "Qual opção prefere?",
        "values": ["Opção 1", "Opção 2"],
        "selectableCount": 1
      }
    }
  }
}
```

## Carrosséis

O carrossel exige entre dois e dez cartões. Cada cartão precisa de uma imagem ou vídeo; pode ter corpo, rodapé e botões. O gateway prepara a mídia através de `prepareWAMessageMedia` e envia `interactiveMessage.carouselMessage` por `relayMessage`.

```json
{
  "phone": "<E164>",
  "content": "Veja as opções",
  "messageType": "carousel",
  "metadata": {
    "cards": [
      {
        "image": "https://media.example.com/a.jpg",
        "body": "Plano A",
        "buttons": [{ "id": "plan-a", "displayText": "Escolher A" }]
      },
      {
        "image": "https://media.example.com/b.jpg",
        "body": "Plano B",
        "buttons": [{ "id": "plan-b", "displayText": "Escolher B" }]
      }
    ]
  }
}
```

Para mídia privada, não enviar `data:` URLs ou ficheiros locais para o endpoint. O contrato do projeto exige uma referência de storage privada permitida; o teste unitário usa uma fixture isolada.

## Fallback e compatibilidade

Botões, listas e carrosséis têm fallback textual numerado quando o cliente não renderiza o Native Flow. Envelopes enviados pelo endpoint directo podem definir `metadata.disableFallback: true` durante um teste visual, mas o produto deve manter fallback por defeito. Enquetes são nativas e não recebem fallback textual.

A camada de wire acrescenta os nós compatíveis com forks activos (`biz`, `native_flow` e `bot`) somente ao relay de mensagens interactivas. Isto não cria um provider adicional e não altera o canal operacional do produto.

## Testes e limites

Os contratos são validados em `server/interactive-messages.ts`. Os construtores e a serialização protobuf têm cobertura em `forte-whatsapp/src/interactive-payload.test.ts`, o wire em `interactive-wire.test.ts` e o Pix em `pix-payment.test.ts`. Antes de integrar na `main`, executar os gates da aplicação, os gates do gateway e um smoke test controlado com um contacto dedicado.
