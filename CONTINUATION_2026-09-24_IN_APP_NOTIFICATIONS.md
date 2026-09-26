# Forte Panel — Caixa interna de notificações

**Data:** 24/09/2026  
**Repositório:** `geordptoroy/forte-panel`  
**Branch:** `main`

## Objetivo

Conectar as preferências já persistidas do workspace a alertas operacionais úteis dentro do próprio painel, sem introduzir dependência de e-mail, WhatsApp ou push. A notificação é individual: só o destinatário autorizado pode consultar, ler ou alterar seu estado.

## Comportamento entregue

A campainha no `PanelLayout` exibe a contagem não lida e atualiza a consulta a cada 30 segundos. Seu popover lista título, descrição, data no fuso do workspace e rota de destino; abrir um item o marca como lido e navega para a área correspondente. Também há ações para marcar um item ou todos como lidos, com atualização otimista e rollback em caso de falha.

As notificações são gravadas em `notifications`, com chave única por workspace, usuário e evento. A migration `0009_in_app_notifications` cria a tabela e índices para ordenar a caixa e consultar não lidas. A gravação de `domainEvents` e dos alertas de destinatários é transacional; repetir o mesmo evento não duplica itens.

`contact.created` respeita `newLead` e notifica gestores ativos e atendentes humanos ativos. `appointment.created` e `appointment.confirmed` respeitam suas preferências e notificam gestores ativos e somente o executor associado ao agendamento. Cancelamentos e demais eventos não geram alerta porque não existem preferências correspondentes. Uma transição que tenta definir novamente o mesmo estado do agendamento não emite novo evento.

As procedures da caixa são restritas a membros ativos e sempre filtram por `ctx.user.id` e workspace. Consulta/alteração das preferências globais exige papel de gestor. O teste de integração identificou e corrigiu uma possível ampliação de destinatários: a conta administradora de bootstrap só entra como fallback quando não há gestor ativo e quando não possui membership (nem ativo nem inativo) no workspace; assim não recebe avisos de outros workspaces ou de usuários desativados.

Quando `dailySummary` está ligado, o worker verifica workspaces ativos uma vez por minuto. A partir das 18h no fuso de cada workspace, grava para cada gestor ativo um resumo com agendamentos não cancelados iniciados e contatos criados no dia local. A chave diária é estável, então reinícios ou repetições não geram cópias extras. O cálculo de limites respeita dias de 23/25 horas em mudanças de horário de verão.

## Arquivos principais

- `drizzle/schema.ts` — entidade `notifications` e seus índices.
- `drizzle-pg/0009_in_app_notifications.sql`, `drizzle-pg/meta/_journal.json` e `drizzle-pg/meta/0009_snapshot.json` — migration PostgreSQL.
- `server/notification-contract.ts` — defaults, parsing tolerante, mapeamento de preferências, cópia dos alertas e chave do resumo.
- `server/db.ts` — emissão transacional, consultas pessoais, marcação de leitura e geração idempotente do resumo diário.
- `server/routers.ts` — procedures tRPC protegidas da caixa e das preferências.
- `server/worker.ts` — acionamento recorrente do resumo diário pelo worker já existente.
- `server/agenda.ts` — elimina eventos redundantes quando o estado já é o mesmo.
- `client/src/components/PanelLayout.tsx`, `client/src/index.css` — campainha, popover e estados de leitura.
- `client/src/pages/SettingsTabs.tsx` — preferências globais visíveis somente a gestores.
- `server/notification-contract.test.ts`, `server/notifications.test.ts`, `server/schedule.test.ts` e `server/professional-isolation.test.ts` — contratos, testes PostgreSQL e verificações de autorização/fuso.
- `API_CONTRACT.md` e `todo.md` — contrato e prioridades atualizados.

## Validação

| Verificação | Resultado |
|---|---|
| `pnpm check` com PostgreSQL | Sucesso |
| `pnpm test` com PostgreSQL 16 | 40 testes aprovados em 10 arquivos |
| Regras puras do contrato de notificação | 4 testes aprovados |
| Integração PostgreSQL da caixa | 4 testes aprovados: destinatários, opt-out, deduplicação, isolamento de leitura e resumo diário |
| `pnpm build` | Sucesso; permanece o aviso conhecido de chunk frontend acima de 500 kB |
| `git diff --check` | Sucesso |
| Conferência visual | Sino, badge, popover, estados vazios/não lidos, preferências administrativas e destinos `/inbox`/`/agenda` verificados no navegador |
| PostgreSQL de teste | Migration `0009_in_app_notifications` aplicada |

A validação visual usou notificações manuais temporárias numa instalação local de teste. Os dois registros foram apagados depois da conferência e o servidor local temporário foi encerrado; nada foi adicionado a fixture ou seed de produção.

## Próximos passos


Notificações externas não estão implementadas, por decisão de produto: o escopo escolhido foi a caixa dentro do painel.

## Como validar novamente

```bash
DATABASE_URL=postgresql://... pnpm exec drizzle-kit migrate
DATABASE_URL=postgresql://... DEMO_MODE=false pnpm check
DATABASE_URL=postgresql://... DEMO_MODE=false pnpm test
pnpm build
```

A suíte `server/notifications.test.ts` e os testes de isolamento de profissionais usam PostgreSQL real quando `DATABASE_URL` aponta para um banco PostgreSQL e são ignorados sem banco.

## Próxima sessão

1. Ler este documento, `todo.md` e `API_CONTRACT.md`.
3. Manter a implementação de notificações restrita ao painel até uma futura decisão explícita de canal externo.
4. Não usar o banco de produção para fixtures de teste; as verificações de integração devem receber `DATABASE_URL` de teste isolado.
5. Encerrar servidores locais de preview depois da validação, em vez de deixá-los como processos residentes.

**Estado desta entrega:** alterações implementadas, testadas e verificadas visualmente. Os registros manuais da validação foram limpos. O teste da rotina diária também confirmou que workspaces sem gestores ativos não recebem resumo por fallback de bootstrap, conforme o comportamento atual.

**Importante:** o navegador foi acessado usando credenciais locais temporárias configuradas só para esta validação. Não reutilizar essas credenciais em qualquer ambiente compartilhado ou de produção.
