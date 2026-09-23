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
- Testes, TypeScript e build validados.

## Em andamento

- Conectar Agenda ao banco e à ficha do cliente.
- Persistir notas internas e registros de faturamento.
- Substituir seed por sincronização segura com PAPI/n8n/CRM/Agenda.

## Bugs ou riscos conhecidos

- O projeto ainda usa o banco MySQL/TiDB do scaffold WebDev; a arquitetura definitiva do prompt pede PostgreSQL, Redis e workers Docker.
- As integrações externas permanecem bloqueadas em modo demo por segurança.
- O preview usa autenticação pública temporária para acelerar a validação visual; o próximo passo de produção é aplicar autorização por usuário/empresa.
