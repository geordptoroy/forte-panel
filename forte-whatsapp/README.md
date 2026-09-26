# forte-whatsapp

Gateway WhatsApp próprio do Forte Panel, em implementação sobre Baileys. O serviço é original e não copia nem modifica a imagem proprietária da PAPI.

## MVP atual

O primeiro bloco oferece uma instância, sessão persistente em `WHATSAPP_SESSION_DIR`, QR/status, conexão/reconexão, envio de texto e webhook assinado de mensagens de texto recebidas. A API é interna e exige `Authorization: Bearer <WHATSAPP_API_KEY>`.

## Variáveis

Copie `.env.example` para um ambiente local e preencha somente localmente. Nunca versione credenciais ou a pasta `sessions`.

## Endpoints

- `GET /health`
- `GET /ready`
- `GET /api/instances`
- `POST /api/instances/default/connect`
- `GET /api/instances/default`
- `POST /api/instances/default/send-text` com `{ "phone": "5511...", "text": "..." }`

Baileys não é afiliado ao WhatsApp. O uso deve respeitar os termos aplicáveis e não pode ser usado para spam.
