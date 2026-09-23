# Forte Panel na VPS

## Objetivo

O Forte Panel será executado futuramente na mesma rede Docker da stack Pastorini. O painel não deve assumir que PAPI, n8n, Qdrant ou LocalAI estão dentro do mesmo processo; cada integração deve ser acessada por URL interna, token em variável de ambiente e um adaptador isolado. CRM, funil e agenda são módulos nativos do próprio painel.

Durante o desenvolvimento visual e a primeira vertical slice, o projeto continua usando o backend gerenciado do WebDev e o banco do scaffold. Esta decisão mantém o preview estável. A migração para a VPS deve acontecer antes de habilitar integrações reais e deve trocar o driver de persistência para PostgreSQL, sem alterar as telas.

## Mapa de serviços

| Serviço do compose | Papel no produto | Acesso do Forte Panel | Regra de segurança |
|---|---|---|---|
| `pastorini_api` | WhatsApp, mídia e sessões | `PAPI_BASE_URL` | Nunca expor a API key no frontend |
| `redis_papi` | Filas, cache e eventos do PAPI | `REDIS_URL` | Usar senha e rede privada |
| `postgres_papi` | Banco operacional do PAPI | Não acessar diretamente pelo painel | Apenas o PAPI deve ser dono desse schema |
| `n8n` | Orquestração, IA e webhooks | `N8N_BASE_URL` + token | Webhooks assinados e idempotentes |
| `postgres_n8n` | Persistência do n8n | Não acessar diretamente pelo painel | Isolar o schema do n8n |
| `qdrant` | Memória vetorial e busca semântica | `QDRANT_URL` | Não publicar a porta em produção sem proxy/autenticação |
| `localai` | API local compatível com OpenAI | `LOCALAI_BASE_URL` | Modelos e prompts somente no servidor |
| `forte-panel` | CRM, agenda, funil e regras de negócio | `PANEL_PUBLIC_URL` | Fonte de verdade do produto |
| `forte-panel-worker` | Jobs de sincronização e automações | Redis + API interna | Consumir eventos de forma idempotente |
| `forte-panel-api` | API pública versionada e webhooks para n8n | domínio público HTTPS | Sem segredos no bundle do cliente |

## Variáveis necessárias

O arquivo `.env` da VPS deve conter as variáveis abaixo. Os valores reais não entram no Git nem no frontend.

```env
NODE_ENV=production
PORT=3000
PANEL_PUBLIC_URL=https://painel.seudominio.com
DATABASE_URL=postgresql://forte_panel:CHANGE_ME@postgres_panel:5432/forte_panel
REDIS_URL=redis://:CHANGE_ME@redis_panel:6379/0
PAPI_BASE_URL=http://pastorini_api:3000
PAPI_API_KEY=CHANGE_ME
N8N_BASE_URL=http://n8n:5678
N8N_API_KEY=CHANGE_ME
QDRANT_URL=http://qdrant:6333
LOCALAI_BASE_URL=http://localai:8080
WEBHOOK_SIGNING_SECRET=CHANGE_ME
```

## Ordem de migração

Primeiro, criar `postgres_panel` e `redis_panel` como serviços independentes dos bancos do PAPI e do n8n. Em seguida, converter o schema atual para PostgreSQL e ampliar o domínio para empresas, equipes, agenda e automações. Depois, subir API e worker separados, validar healthchecks e só então habilitar o adaptador do PAPI e os webhooks do n8n.

O banco do PAPI não deve ser usado como banco de negócio do painel. O n8n também não deve ser consultado diretamente para montar a UI; o painel deve manter seu próprio estado e receber eventos sincronizados com idempotência. A agenda será nativa do Forte Panel, sem Easy!Appointments, e o CRM será nativo, sem Clientverse.

## Requisitos de produção

Todos os serviços devem ficar na rede privada do compose. Apenas o proxy reverso deve publicar portas externas. O painel precisa de healthcheck HTTP, logs estruturados, timeouts por integração, retry com backoff, chave de idempotência por mensagem/evento e trilha de auditoria para ações humanas. O worker não deve ser iniciado dentro do mesmo processo HTTP quando a carga real for habilitada.
