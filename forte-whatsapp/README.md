# forte-whatsapp

Gateway interno WhatsApp do Forte Panel, implementado sobre Baileys. O serviço não é uma API pública nem integração n8n: o Panel e o worker se comunicam com ele na rede Docker usando Bearer key; eventos inbound retornam ao Panel pelo webhook assinado.

## Estado deste core

O gateway mantém várias sessões em um `InstanceRegistry`, com um `InstanceManager` por `instanceId`. O Panel provisiona e vincula cada ID a um workspace. Cada sessão tem diretório próprio dentro de `WHATSAPP_SESSION_DIR`, lock de processo, autenticação persistente, status/QR, outbox de eventos e ações independentes.

Novas instâncias não conectam ao serem criadas. O usuário deve escolher **Conectar e gerar QR** ou solicitar o código de pareamento. IDs `default` e `WHATSAPP_INSTANCE_ID` são compatibilidade para sessões antigas existentes; o gateway não cria a sessão default se ela não estiver no diretório de sessões.

## Variáveis

Copie `.env.example` somente para ambiente local. Nunca versione chaves ou a pasta de sessões. `WHATSAPP_API_KEY` protege as chamadas internas. `WHATSAPP_WEBHOOK_URL` e `WHATSAPP_WEBHOOK_SECRET` ativam o callback assinado. `WHATSAPP_SESSION_ENCRYPTION_KEY` contém uma chave de 32 bytes em hex ou base64 para AES-256-GCM; é obrigatória em produção e deve ser preservada para manter as sessões. `WHATSAPP_MAX_INSTANCES` limita novas sessões (padrão: 10; máximo: 25).

## Endpoints

Probes internas:

- `GET /health` — processo vivo, sem afirmar conexão WhatsApp.
- `GET /ready` — estado do processo/sessões; não publicar fora da rede interna.

Todas as operações abaixo exigem `Authorization: Bearer <WHATSAPP_API_KEY>`:

- `GET /api/instances` e `POST /api/instances` — listar/criar;
- `GET /api/instances/{instanceId}` e `PATCH /api/instances/{instanceId}` — status/rename;
- `DELETE /api/instances/{instanceId}` — logout e remoção dos arquivos da sessão;
- `GET /api/instances/{instanceId}/qr`;
- `POST /api/instances/{instanceId}/connect`, `/pairing-code`, `/disconnect` e `/logout`;
- `POST /api/instances/{instanceId}/send` — transporte Baileys genérico existente; não significa que o composer do Panel já suporte cada modalidade.

O envio precisa informar `instanceId`. Não há fallback para um ID global default.

## Pareamento por código

O projeto fixa `baileys@7.0.0-rc14`. Nessa versão, `requestPairingCode()` enviava `companion_hello` com `sendNode()` e podia devolver um código antes de receber a resposta IQ do WhatsApp. A imagem agora aplica `patches/baileys+7.0.0-rc14.patch` pelo hook npm `postinstall`: aguarda `query()` por até 20 segundos (que rejeita respostas IQ de erro), limpa o código transitório se houver falha e só persiste `creds.me` após aceite. A identidade do browser deve ser canônica (`Chrome (Ubuntu)`), nunca o nome da aplicação.

O patch local é um backport pequeno do comportamento de confirmação proposto no PR upstream [#2559](https://github.com/WhiskeySockets/Baileys/pull/2559), que ainda estava aberto e fora do pacote npm quando auditado em 28/09/2026. Ao atualizar Baileys para uma release que contenha o fix, verificar e remover o patch deliberadamente. O código retornado tem 8 caracteres e pode conter letras; a UI o exibe sem transformar. Um código aceito ainda precisa ser inserido no telefone antes de a sessão chegar a `open`.

## Operação e validação

- Testes do gateway fazem parte da suíte raiz: `pnpm test`.
- Checagem separada de tipos: `pnpm exec tsc --noEmit -p forte-whatsapp/tsconfig.json`.
- A outbox mantém retries para 5xx, timeout, rede, `408` e `429`; outros `4xx` são falhas permanentes e vão para `WHATSAPP_WEBHOOK_OUTBOX_DIR/dead-letter/` com o envelope e o motivo sanitizado. Esse diretório é diagnóstico, não fila ativa.
- Testes reais de número/QR devem ser feitos no Docker local do usuário com linha de teste; não usar conta real sem autorização.
- A sessão é persistente e importante. Não limpar o volume `forte_whatsapp_sessions` como forma de reiniciar o serviço.

Baileys não é afiliado ao WhatsApp. Use em conformidade com os termos aplicáveis e não para spam.
