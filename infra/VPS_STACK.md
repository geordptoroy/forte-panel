# Stack de produção — Forte Panel

## Componentes

| Serviço | Responsabilidade |
|---|---|
| `forte-panel` | Interface, API e autenticação do produto |
| `forte-panel-worker` | Fila de mensagens, eventos internos e agente nativo |
| `postgres_panel` | Dados de negócio do Forte Panel |
| `redis_panel` | Cache/coordenação quando habilitado |
| Provider WhatsApp (PAPI ou Meta Cloud API) | Transporte de mensagens e webhooks |

O backend não acessa banco de dados interno do provider. Persistência do CRM, agenda, equipe, configurações e histórico pertence ao PostgreSQL do Panel.

## Operação recomendada

- publicar somente HTTPS por reverse proxy; manter PostgreSQL e Redis em redes privadas;
- não commitar `.env`, credenciais nem valores padrão utilizáveis;
- fixar imagens por versão/digest e executar com usuário não-root;
- usar health/readiness checks, logs estruturados, alertas e backups fora do host;
- testar restauração de backup antes de considerar o ambiente apto a produção;
- separar desenvolvimento, staging e produção;
- validar migrations e testes de isolamento entre workspaces antes de abrir cadastros públicos.

## Configuração

Use os Compose mantidos para o Panel e o provider escolhido. As chaves de provider e assinatura de webhook devem ser injetadas pelo ambiente de execução ou secret manager. Não publique portas administrativas, banco ou cache.
