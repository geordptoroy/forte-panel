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
- Testes, TypeScript e build validados.

## Próxima fase

- Migrar a persistência do scaffold MySQL/TiDB para PostgreSQL próprio do painel antes de habilitar integrações reais.
- Adicionar Redis próprio do painel e worker separado para retries, sincronização e webhooks.
- Persistir Agenda e faturamento no schema portátil.
- Implementar adaptadores reais atrás dos contratos, começando pelo PAPI e n8n.
- Criar healthchecks, autenticação por usuário/empresa e proxy HTTPS na VPS.

## Bugs ou riscos conhecidos

- O preview atual ainda usa o banco MySQL/TiDB do scaffold WebDev; isso é temporário e não representa a topologia final da VPS.
- As integrações externas permanecem bloqueadas em modo demo por segurança.
- O compose anexado contém credenciais e licença em texto puro; elas precisam ser substituídas por secrets antes de qualquer deploy.
