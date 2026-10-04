# Pix nativo no WhatsApp via Baileys

## Resumo

O Forte Panel envia o Pix como um `InteractiveMessage` Native Flow directamente pelo gateway interno `forte-whatsapp`. Não é uma cobrança real criada pelo gateway: é uma mensagem nativa do WhatsApp que apresenta a chave Pix e, quando configurada com valor, mostra o cartão **Pagar com Pix**.

O formato com valor foi obtido comparando uma mensagem nativa recebida pela própria instância. A combinação importante é:

- botão `review_and_pay`;
- `payment_configuration: "merchant_categorization_code"`;
- `payment_settings[].type: "pix_static_code"`;
- `pix_static_code.key_type: "PHONE"` quando a chave é um telefone;
- `total_amount.value` e `total_amount.offset` como números;
- `value: 10000` e `offset: 1000` representam R$ 10,00;
- não enviar o objecto `order` neste envelope.

> Este é um formato Native Flow não documentado publicamente pela API oficial para este uso. O WhatsApp pode alterar a renderização ou deixar de aceitar o envelope.

## Endpoints do gateway

### Listar instâncias

```http
GET /api/instances
Authorization: Bearer <GATEWAY_API_KEY>
```

### Enviar payload Native Flow directo

```http
POST /api/instances/<INSTANCE_ID>/send
Authorization: Bearer <GATEWAY_API_KEY>
Idempotency-Key: pix-<uuid>
Content-Type: application/json
```

O endpoint aceita `phone` como número internacional ou JID. Para evitar ambiguidades em números brasileiros, o resolvedor do gateway tenta a variante com e sem o nono dígito; um JID explícito, como `5538999034689@s.whatsapp.net`, é preservado.

## Botão Pix sem valor

Usar `payment_info` quando o objectivo é apresentar a chave e a acção de copiar/pagar sem valor:

```json
{
  "phone": "<E164>@s.whatsapp.net",
  "payload": {
    "interactiveMessage": {
      "body": { "text": "" },
      "nativeFlowMessage": {
        "messageVersion": 1,
        "buttons": [
          {
            "name": "payment_info",
            "buttonParamsJson": "{...}"
          }
        ]
      }
    }
  }
}
```

O JSON de `buttonParamsJson` deve conter `payment_settings` com `pix_static_code`. Não adicionar um `total_amount` quando se quer apenas o botão de cópia.

## Pix nativo com valor

Para R$ 10,00, o `buttonParamsJson` deve ter esta forma:

```json
{
  "reference_id": "<REFERENCIA_UNICA>",
  "type": "physical-goods",
  "payment_configuration": "merchant_categorization_code",
  "payment_settings": [
    {
      "type": "pix_static_code",
      "pix_static_code": {
        "merchant_name": "rafael",
        "key": "<CHAVE_PIX>",
        "key_type": "PHONE"
      }
    }
  ],
  "currency": "BRL",
  "total_amount": {
    "value": 10000,
    "offset": 1000
  },
  "order_request_id": "<ID_UNICO_DO_PEDIDO>"
}
```

O envelope exterior continua a ser:

```json
{
  "interactiveMessage": {
    "body": { "text": "" },
    "nativeFlowMessage": {
      "messageVersion": 1,
      "buttons": [
        {
          "name": "review_and_pay",
          "buttonParamsJson": "<JSON_ACIMA_SERIALIZADO>"
        }
      ]
    }
  }
}
```

### Conversão de valores

O valor usa a mesma convenção de `value / offset` observada na mensagem original:

| Valor apresentado | `value` | `offset` |
|---|---:|---:|
| R$ 9,90 | 990 | 1000 |
| R$ 10,00 | 10000 | 1000 |
| R$ 100,00 | 100000 | 1000 |

Os campos devem ser **números JSON**, não strings.

## Código reutilizável

O helper `forte-whatsapp/src/pix-payment.ts` gera os dois envelopes:

```ts
buildPixPaymentPayload({
  merchantName: "rafael",
  pixKey: "<CHAVE_PIX>",
  pixKeyType: "PHONE",
  amountCents: 10000,
  referenceId: crypto.randomUUID(),
  orderRequestId: crypto.randomUUID(),
});
```

- sem `amountCents`: gera `payment_info`;
- com `amountCents`: gera `review_and_pay` com `merchant_categorization_code`, `total_amount` numérico e sem `order`.

## Endpoint público do Panel

O endpoint de aplicação é `POST /api/messages`, autenticado pela API key do workspace. Ele aceita mensagens `button` com `metadata.buttons`, mas o envelope Pix com valor deve chegar ao gateway como `payload` directo para preservar o corpo vazio e evitar o carácter `?` no rodapé. A integração do provider deve chamar o endpoint interno do gateway depois de resolver a instância e aplicar a idempotência.

## Segurança e operação

- Nunca registar a chave Pix em logs. O diagnóstico temporário redige `pix_static_code.key`.
- Usar sempre uma `Idempotency-Key` nova por envio.
- `reference_id` e `order_request_id` devem ser únicos por mensagem com valor.
- O formato não substitui um PSP, não confirma pagamento e não deve ser usado para declarar uma transacção liquidada.
- O teste real deve usar um contacto dedicado e autorização explícita.
