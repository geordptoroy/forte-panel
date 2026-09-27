# forte-whatsapp

Gateway WhatsApp próprio do Forte Panel, implementado sobre Baileys. O serviço é original e não copia nem modifica a imagem proprietária da PAPI.

## Estado atual

O gateway possui uma instância por processo, sessão persistente em `WHATSAPP_SESSION_DIR`, QR/status, conexão/reconexão, webhook assinado, recebimento de texto e mídia, download multimídia, envio de texto e envio genérico compatível com `AnyMessageContent`. Eventos de chamadas recebidas são encaminhados ao Panel como eventos inbound.

A API é interna e exige `Authorization: Bearer <WHATSAPP_API_KEY>`.

## Variáveis

Copie `.env.example` para um ambiente local e preencha somente localmente. Nunca versione credenciais ou a pasta `sessions`.

## Endpoints principais

- `GET /health`
- `GET /ready`
- `GET /api/instances`
- `POST /api/instances/default/connect`
- `GET /api/instances/default`
- `GET /api/instances/default/qr`
- `POST /api/instances/default/send-text`
- `POST /api/instances/default/send` com `messageType` ou payload genérico Baileys

O payload genérico permite texto, imagem, áudio, vídeo, documento, sticker, localização, contato, reação, enquete e outros tipos suportados pela versão instalada do Baileys. A disponibilidade de cada tipo precisa ser confirmada no canal e ainda não implica que o composer do Inbox ofereça todos eles.

## Pendências de produção

- substituir `useMultiFileAuthState` por store durável e criptografado;
- o gateway já usa lock atômico por diretório de instância para impedir duas conexões concorrentes; ainda falta lifecycle de múltiplas instâncias por workspace;
- mover mídia de data URL para storage privado com URL assinada;
- executar E2E em Docker/staging com número de teste;
- adicionar métricas de conexão, download, envio, retry e desconexão.

Baileys não é afiliado ao WhatsApp. O uso deve respeitar os termos aplicáveis e não pode ser usado para spam.
