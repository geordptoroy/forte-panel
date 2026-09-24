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
- Testes de isolamento entre profissionais e script `scripts/validate-flow.mjs` com validações por HTTP.
- Agendamentos validados contra a jornada semanal no fuso horário do workspace; horários sem jornada ou fora do horário são recusados.
- Sobreposição entre qualquer estado ativo de atendimento (inclusive `requested`) é recusada; intervalos consecutivos são permitidos.
- Criação/reagendamento e mudança da jornada serializados por lock da linha do profissional, protegendo contra reservas concorrentes.
- API v1 de disponibilidade expõe as faixas semanais por profissional.
- Testes unitários de fuso/jornada, integração PostgreSQL e validação E2E HTTP concluídos.
- Caixa interna de notificações persistente por usuário, com contagem, leitura individual/em lote e atualização periódica do sino.
- Eventos de lead, agendamento criado e confirmado respeitam preferências e papéis; notificações são deduplicadas por workspace, usuário e evento.
- Resumo diário idempotente às 18h do fuso local, executado pelo worker e destinado a gestores ativos.
- TypeScript, build e 40 testes com PostgreSQL aprovados; testes de segurança cobrem visibilidade pessoal e restrição das preferências globais.

## Próxima fase

- Adaptar o workflow n8n para chamar a API do Panel e substituir a ferramenta Clientverse.
- Importar o workflow real no n8n e exercitar a stack Docker Compose reduzida numa máquina com Docker; o sandbox atual não possui Docker.
- Adicionar tela operacional para reprocessar eventos com status `failed` e visualizar tentativas do outbox.
- Completar hardening de deploy: proxy HTTPS e substituição das credenciais em texto puro no compose anexado.
- Migrar a autenticação da API para chave por workspace com hash, no lugar da chave de ambiente.

## Bugs ou riscos conhecidos

- A migration `0009_in_app_notifications` foi aplicada no PostgreSQL 16 local de teste. O `docker compose up --build` completo segue pendente porque o sandbox não possui Docker.
- A jornada atual representa janelas dentro de um dia; agendamentos que cruzam a meia-noite são recusados porque o schema ainda não representa turnos noturnos.
- A caixa interna está implementada; notificações externas por e-mail, WhatsApp ou push ainda não fazem parte do canal escolhido.
- As integrações externas permanecem bloqueadas em modo demo por segurança.
- O compose anexado contém credenciais e licença em texto puro; elas precisam ser substituídas por secrets antes de qualquer deploy.
- O Redis já está provisionado no compose, mas o worker atual usa o outbox PostgreSQL e polling; Redis poderá assumir debounce/cache em uma etapa posterior.
