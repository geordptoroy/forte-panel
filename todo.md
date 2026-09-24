# Forte Panel — acompanhamento do MVP

## Concluído

- Shell dark responsivo inspirado no Forte Media.
- Dashboard, Inbox, Kanban, Agenda, Contatos, ficha do cliente, Faturamento, Integrações e Configurações em modo demo.
- Schema persistente para contatos, conversas, mensagens e auditoria.
- Seed demo idempotente para o primeiro ambiente sem dados.
- Inbox conectado ao backend via tRPC.
- Pausar e reativar IA persistindo o estado do contato e registrando auditoria.
- Enviar mensagem manual persistindo mensagem, controle humano e preview do contato.
- Kanban conectado ao mesmo conjunto de contatos; mudança de estágio persistente e auditada.
- Contatos e ficha do cliente carregando registros e mensagens persistentes.
- Contratos internos para PAPI, n8n, Qdrant e LocalAI; CRM e agenda passam a ser módulos nativos.
- Documento de topologia e variáveis para futura implantação na VPS.
- Agenda nativa persistente com serviços, profissionais, disponibilidade, conflitos e ficha do contato.
- Contrato `API_CONTRACT.md`, healthcheck `/api/v1/health`, autenticação por bearer token e idempotência persistente.
- Endpoints iniciais de contatos, disponibilidade, agendamentos e webhook inbound de WhatsApp.
- Endpoints de mensagens enfileiradas, mudança de estágio, cancelamento e reagendamento.
- Registro persistente de eventos webhook para evitar processamento duplicado.
- Arquitetura multi-provedor com adapters PAPI e Meta Cloud API; seleção de canal padrão por workspace.
- Leitura e documentação do workflow n8n de 34 nós em `N8N_ADAPTATION.md`.
- Procedimento de teste local da stack em `infra/LOCAL_TEST.md`, removendo Easy/Clientverse.
- Dockerfile, entrypoint, `.env.local.example` e `docker-compose.local.yml` para painel + PostgreSQL + Redis próprios.
- Endpoint `POST /api/v1/lead-memory` e tabela de notas próprias para substituir a ferramenta Clientverse/Lead Memory.
- Adapter PAPI real, adapter Meta Cloud API, worker separado para mensagens e migrations PostgreSQL versionadas.
- Node comunitário n8n com uma única AI Tool do Forte Panel, build próprio e contrato de credencial.
- Outbox PostgreSQL de eventos de domínio com assinatura HMAC, retries, backoff e recuperação após reinício.
- Autorização baseada no papel do workspace, com perfil operacional e vínculo ao profissional executor.
- Catálogo operacional persistido: serviços, profissionais, vínculos profissional-serviço e jornada semanal.
- Portal do profissional em `/my-work` com visões de dia, semana, mês e clientes, sempre restritas à própria agenda.
- Ciclo de atendimento com status `in_progress`, iniciado e concluído pelo próprio profissional.
- Telas administrativas de Serviços, Profissionais, Equipe e Configurações com ações persistidas.
- Migrations `0007_professional_services` e `0008_operational_catalog` aplicadas e validadas em PostgreSQL 16 real.
- Testes de isolamento entre profissionais e script `scripts/validate-flow.mjs` com 21 validações por HTTP.
- Testes, TypeScript e build validados.

## Próxima fase

- Adaptar o workflow n8n para chamar a API do Panel e substituir a ferramenta Clientverse.
- Executar o primeiro teste local com a stack reduzida e importar o workflow real no n8n.
- Validar `docker compose up --build` na máquina local; o sandbox não possui Docker instalado.
- Criar healthchecks, autenticação por usuário/empresa e proxy HTTPS na VPS.
- Adicionar tela operacional para reprocessar eventos com status `failed` e visualizar tentativas do outbox.
- Publicar eventos de confirmação de agendamento e tarefas quando esses módulos emitirem as transições correspondentes.
- Validar a jornada semanal no agendamento: recusar horários fora da `availability` do profissional.
- Impedir sobreposição de atendimentos para o mesmo profissional no mesmo intervalo.
- Disparar de fato as notificações cujas preferências já estão persistidas em `workspaceSettings`.
- Migrar a autenticação da API para chave por workspace com hash, no lugar da chave de ambiente.

## Bugs ou riscos conhecidos

- O preview e o compose usam PostgreSQL. A validação desta etapa foi feita com um PostgreSQL 16 instalado no próprio sandbox, aplicando as migrations e executando os testes de isolamento; o `docker compose up --build` completo segue pendente porque o sandbox não possui Docker.
- O agendamento valida vínculo profissional-serviço e período, mas ainda não compara o horário com a jornada semanal nem detecta sobreposição de atendimentos.
- As preferências de notificação são persistidas, porém nenhum canal de envio (e-mail, WhatsApp ou push) está ligado a elas.
- As integrações externas permanecem bloqueadas em modo demo por segurança.
- O compose anexado contém credenciais e licença em texto puro; elas precisam ser substituídas por secrets antes de qualquer deploy.
- O Redis já está provisionado no compose, mas o worker atual usa o outbox PostgreSQL e polling; Redis poderá assumir debounce/cache em uma etapa posterior.
