

---

## 12. Handoff da validação da Inbox — 2026-09-28 13:13 BRT

**Nenhuma alteração de código foi feita nesta etapa.** Este registro apenas consolida os testes manuais do usuário e prepara a próxima IA.

### Evidências confirmadas pelo usuário

- O envio de texto funcionou: a mensagem chegou ao outro número, mas a Inbox não exibiu exatamente o conteúdo enviado; o caso observado foi um `oi` que apareceu de forma incorreta como conteúdo genérico de mídia.
- O envio de imagem pela Inbox funcionou e a imagem apareceu no WhatsApp destinatário.
- O recebimento de imagem e áudio na Inbox funcionou.
- Falta um botão/controle de áudio na interface do composer da Inbox.
- A IA não foi pausada/desligada quando o usuário enviou uma mensagem pelo número conectado à instância; investigar a distinção entre mensagem inbound do contato, mensagem `fromMe`, takeover humano e `humanControlled`.
- Ainda falta comprovar visualmente e por teste de isolamento que a Inbox mostra somente mensagens das instâncias Baileys pertencentes ao workspace autenticado.
- O usuário solicitou filtro de instâncias na Inbox com seleção múltipla: uma instância, várias instâncias ou todas.

### Estado técnico publicado antes deste handoff

- Repositório: `geordptoroy/forte-panel`.
- Branch: `main`.
- Último commit publicado: `c23d495 feat: activate inbox with baileys message coverage`.
- A Inbox está liberada no modo Core e aparece na sidebar como **Atendimento**.
- A rota `/inbox` está no allowlist do `CORE_ONLY_MODE`; as demais páginas continuam congeladas.
- O último commit ampliou a normalização/ingestão para sticker, localização, contato, enquete, lista, botão e reação, além de manter mídia e metadados Baileys.
- Typecheck, build e 23 testes específicos passaram antes deste handoff.

### Prioridade imediata para o próximo chat

1. Reproduzir o caso do `oi` ponta a ponta e comparar o payload em cada etapa: Baileys → WebhookOutbox → API webhook → normalização → banco → `inbox.thread` → `MessageBubble`. Não mascarar falhas com o fallback `[mídia recebida]`.
2. Confirmar que texto simples usa `conversation`/`extendedTextMessage.text` e que o `messageType` não é promovido para mídia por heurística incorreta.
3. Adicionar o botão de áudio ao composer sem quebrar texto, imagem, vídeo e documento; definir se será upload de arquivo de áudio e/ou gravação, documentando a decisão antes de implementar.
4. Auditar o controle da IA: `fromMe`, `aiEnabled`, `humanControlled`, `markRead`, `sendMessage` e `ingestInboundWhatsApp`. Especificar quando uma mensagem manual deve pausar a IA e quando uma mensagem enviada pelo próprio número deve ser ignorada para evitar loop.
5. Implementar filtro de instâncias workspace-scoped na Inbox. A seleção deve aceitar exatamente: uma instância, múltiplas instâncias ou todas; o estado `Todas` deve ser explícito e não pode misturar instâncias de outro workspace.
6. Persistir/consultar a origem por `instanceId` de forma confiável no contato/conversa/mensagem, incluindo mensagens legadas sem origem. Definir comportamento de fallback antes de alterar UI.
7. Adicionar testes negativos de isolamento entre dois workspaces e testes de filtro com uma, várias e todas as instâncias.

### Restrições de continuidade

- Não apagar volumes, sessões Baileys ou dados do usuário.
- Não alterar PAPI/Meta, Console Admin ou páginas congeladas nesta próxima fatia.
- Trabalhar somente na Inbox, contratos Baileys relacionados, testes e documentação necessária.
- Antes de publicar, executar `pnpm check`, typecheck do gateway, testes direcionados, `pnpm build` e `git diff --check`.
- Não afirmar que o filtro por instância está seguro apenas porque o frontend filtra: a query e o backend precisam aplicar o escopo do workspace.
