# Teste local do Forte Panel

## Objetivo

Validar o fluxo nativo `PAPI → webhook do Forte Panel → PostgreSQL/worker → agente nativo → PAPI`, primeiro sem enviar mensagens reais.

## Pré-requisitos

- Docker Engine e Docker Compose;
- variáveis locais preparadas a partir do exemplo, com segredos únicos;
- migrations PostgreSQL aplicadas pelo entrypoint;
- PAPI disponível na rede Docker para testes controlados.

## Subir os serviços

```bash
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs --tail=100 forte-panel forte-panel-worker
```

O Panel usa PostgreSQL próprio para os dados do produto e Redis separado quando habilitado. Não reutilize banco de dados de outro serviço.

## Verificações sem tráfego externo

1. Acesse o healthcheck `/api/v1/health`.
2. Entre na interface e confira workspace, equipe e configurações.
3. Execute typecheck, testes e build: `pnpm check && pnpm test && pnpm build`.
4. Verifique se mensagens ficam na fila e se o worker registra erros claros quando o provider não está configurado.

## Webhook PAPI e teste controlado

Configure a URL pública ou interna do Panel na PAPI: `/api/v1/webhooks/providers/papi`. Exija `X-PAPI-Webhook-Secret` e envie um `eventId` único. Primeiro use número de teste e confira idempotência, histórico, `fromMe`, takeover humano e logs. Só ative envio real depois de revisar o destino e a configuração do agente.

## Limpeza segura

O reset do Panel remove apenas registros explicitamente abrangidos do workspace de desenvolvimento. Não use `docker compose down -v`, pois isso remove volumes persistentes.
