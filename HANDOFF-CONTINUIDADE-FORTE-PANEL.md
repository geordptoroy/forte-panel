

## 30. Interatividade nativa Baileys concluída — 2026-09-29

A camada de mensagens interativas foi fechada no código, sem depender de teste manual para descobrir a integração:

- **Botões** continuam com 1–3 opções.
- **Listas** agora são montadas no `instance-manager` com `sections`, `rows`, `buttonText`, título e rodapé.
- **Enquetes** agora usam o formato nativo `{ poll: { name, values, selectableCount } }` do Baileys.
- **Carousel** aceita o `InteractiveMessage.carouselMessage` nativo via relay do socket, com validação para impedir payload arbitrário sem a estrutura nativa.
- O Inbox ganhou composer para botões, listas e enquetes; carousel pode ser enviado pelo editor JSON do `InteractiveMessage` documentado pelo Baileys.
- O histórico reconhece carousel e o renderiza como mensagem estruturada.
- Foi criada a migration `0044_carousel_message_type.sql`.

Validação automatizada: typecheck e build do Panel, 6 testes focados do backend, 64 testes do gateway Baileys, build TypeScript do gateway e `git diff --check`.
