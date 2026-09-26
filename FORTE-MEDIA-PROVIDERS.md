# Forte Media — arquitetura de provedores

## Decisão

O Forte Media deixa de depender da PAPI como infraestrutura padrão. A instalação oficial local usa apenas:

- **Baileys nativo**: gateway próprio, executado no serviço `forte-whatsapp`;
- **WABA / Meta Cloud API**: provedor externo opcional para clientes que preferirem a API oficial da Meta;
- **Forte Panel**: CRM, inbox, worker, auditoria e configuração multi-tenant.

A PAPI não faz parte do Compose oficial do Forte Media, não é necessária para iniciar o sistema e não deve receber credenciais no `.env`.

## Escolha por workspace

Cada workspace deve escolher um canal ativo:

| Provedor | Quando usar | Requisitos | Custo/limitação |
| --- | --- | --- | --- |
| Baileys nativo | Testes locais, beta testers e operação própria | Número conectado por QR Code; sessão persistente | Não oficial; exige manutenção do gateway |
| WABA / Meta Cloud API | Operação comercial e maior conformidade | Business Manager, número WABA, token e Phone Number ID | Tarifas e políticas da Meta |

O provedor deve ser configurável por workspace. A simulação de agentes continua local e não chama provedores externos.

## Serviços do Compose oficial

- `postgres_panel`: dados do CRM e entidades multi-tenant;
- `redis_panel`: filas e eventos;
- `forte-panel`: API e interface;
- `forte-panel-worker`: processamento assíncrono de mensagens;
- `forte-whatsapp`: gateway Baileys com sessão persistente.

Não existem `pastorini_api`, `postgres_papi`, `redis_papi`, `PAPI_API_KEY`, `PAPI_LICENSE_KEY` ou `PAPI_CLOUD_PANEL_TOKEN` no Compose oficial.

## Segurança local

1. O arquivo `.env` fica somente na máquina do operador e não deve ser commitado.
2. `BAILEYS_API_KEY` autentica chamadas internas ao gateway.
3. `BAILEYS_WEBHOOK_SECRET` autentica eventos recebidos pelo Panel.
4. A sessão do WhatsApp fica no volume `forte_whatsapp_sessions`.
5. O banco fica nos volumes `postgres_panel_data` e `redis_panel_data`.
6. Ações de suporte continuam exigindo motivo e registro de auditoria.

## WABA futuro

A integração WABA usa as variáveis opcionais abaixo no `.env` do ambiente que possuir credenciais da Meta:

```text
META_GRAPH_API_VERSION=v23.0
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
```

Essas credenciais nunca devem ser colocadas no repositório ou compartilhadas no chat.

## Próximos blocos de trabalho

1. Finalizar outbound Baileys para texto, mídia e templates suportados.
2. Conectar o Platform Console ao status real das instâncias Baileys.
3. Adicionar onboarding de WABA por workspace.
4. Remover telas e rotas legadas de PAPI após a migração dos dados existentes.
5. Adicionar health checks e testes end-to-end dos dois provedores.
