

## 28. Interatividade e prompts globais — 2026-09-29

Implementado sem reabrir o bloco congelado:

- O envio persistido aceita `button`, `list` e `poll` além dos tipos já validados.
- O Console Admin e a Inbox pública validam payloads interativos antes de enfileirar o outbound.
- Botões exigem de 1 a 3 opções com `buttonId` e `displayText`.
- Listas/enquetes exigem `metadata.payload`, encaminhado ao gateway Baileys pelo contrato existente de payload.
- Foi criado teste unitário para os contratos interativos.
- **Carrossel não foi falsamente habilitado:** o Baileys atual não oferece um contrato universal de carrossel nesta integração. A implementação deve ganhar um adapter/provider específico antes de ser exposta como funcionalidade.
- O Console Admin ganhou editor de prompt global por `instanceId`, com versão incremental, auditoria e `enabled: false` por segurança. O pareamento fica salvo; respostas automáticas e RAG continuam desligados até os gates de IA.

Gates executados: `pnpm check`, `pnpm build`, testes focados de interatividade/Console Admin e `git diff --check`.
