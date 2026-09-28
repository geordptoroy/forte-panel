# Prompt para o próximo chat — continuar Inbox/Baileys

Você está continuando o trabalho no repositório `geordptoroy/forte-panel`, branch `main`, em sandbox inicial. Leia primeiro:

1. `PROJECT_DOCUMENTATION_INDEX.md`
2. `todo.md`
3. `HANDOFF-CONTINUIDADE-FORTE-PANEL.md`, especialmente a seção **12. Handoff da validação da Inbox — 2026-09-28 13:13 BRT**
4. `AUDITORIA-TECNICA-E-ROADMAP.md`, especialmente a atualização de 2026-09-28
5. `docs/BAILEYS-INTEGRATION.md`
6. `client/src/pages/PanelPages.tsx`
7. `server/api.ts`, `server/integrations/whatsapp.ts`, `server/integrations/contracts.ts`, `server/db.ts`
8. `forte-whatsapp/src/instance-manager.ts` e `forte-whatsapp/src/server.ts`

## Contexto confirmado pelo usuário

- A Inbox foi ativada na sidebar como **Atendimento**.
- O envio de texto funcionou fisicamente para o WhatsApp destinatário.
- O envio de imagem funcionou.
- O recebimento de imagem e áudio funcionou.
- O usuário enviou somente `oi`, mas a Inbox não mostrou exatamente o conteúdo enviado e exibiu conteúdo genérico de mídia. Investigue payload real ponta a ponta antes de corrigir.
- Falta botão/controle de áudio no composer.
- A IA não parou/desligou quando o usuário enviou mensagem pelo número conectado. Investigue `fromMe`, `aiEnabled`, `humanControlled`, takeover e prevenção de loops; não assuma a regra correta sem verificar o fluxo.
- Falta filtro de instâncias na Inbox. Deve permitir uma instância, várias instâncias ou todas.
- É obrigatório verificar que só aparecem mensagens de instâncias pertencentes ao workspace autenticado. Filtro apenas no frontend não é suficiente.

## Estado publicado

Último commit: `c23d495 feat: activate inbox with baileys message coverage`.
Antes de iniciar, confirme `git status`, `git log -1` e se `origin/main` está sincronizado. Não faça reset destrutivo.

## Escopo permitido

Trabalhar somente na Inbox, no contrato/ingestão Baileys diretamente necessário, testes e documentação. Não reabrir páginas congeladas, não modificar Console Admin, PAPI/Meta ou conexão WhatsApp fora do necessário.

## Ordem obrigatória de investigação

1. Reproduzir o caso do texto `oi` com logs/tests, comparando Baileys, WebhookOutbox, webhook API, normalização, banco, `inbox.thread` e `MessageBubble`.
2. Corrigir a origem da divergência de conteúdo e garantir que texto simples não vire `[mídia recebida]`.
3. Auditar quando uma mensagem deve pausar a IA e quando `fromMe` deve ser ignorado para evitar loop.
4. Mapear onde `instanceId` está persistido em mensagem/conversa/contato e como o backend pode filtrar por workspace e instância.
5. Implementar o filtro multi-select com “uma”, “várias” e “todas”, com backend workspace-scoped e estados loading/empty/error.
6. Adicionar o botão de áudio ao composer. Primeiro decidir/documentar se será upload de áudio, gravação, ou ambos; preservar imagem, vídeo e documento.
7. Adicionar testes unitários e de integração para conteúdo textual, IA, isolamento entre workspaces e filtro de instâncias.

## Validação obrigatória antes do commit

Executar:

```bash
pnpm check
pnpm exec tsc --noEmit -p forte-whatsapp/tsconfig.json
pnpm test
pnpm build
git diff --check
```

Depois revisar o diff para impedir formatação incidental ou arquivos duplicados/deprecated. Documentar tudo no handoff e no roadmap. Só então fazer commit/push e acompanhar a publicação `dev` no GitHub Actions.

Não declarar o problema resolvido sem teste real ou fixture reproduzível para: `oi`, imagem, áudio, mensagem manual que deve pausar IA, filtro de uma instância, filtro de múltiplas instâncias e filtro “todas”.
