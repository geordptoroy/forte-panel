

---

## Atualização de roadmap — Inbox pós-validação manual — 2026-09-28

Esta atualização é documental. Nenhuma alteração de código foi realizada neste registro.

### P0/P1 observados no teste real

| Prioridade | Gap | Evidência | Próxima ação |
|---|---|---|---|
| P0 | Texto simples chega ao WhatsApp, mas a Inbox não reproduziu exatamente o conteúdo enviado | O usuário enviou apenas `oi`, enquanto a interface exibiu conteúdo genérico de mídia | Rastrear o payload completo e corrigir a normalização/renderização sem fallback enganoso |
| P1 | Composer não possui ação de áudio | Usuário conseguiu enviar texto e imagem, mas não encontrou botão de áudio | Adicionar controle de upload/gravação de áudio e validar MIME, tamanho, preview e envio Baileys |
| P1 | Estado da IA não mudou após mensagem manual do número conectado | Usuário observou que a IA continuou ativa | Auditar `fromMe`, `aiEnabled`, `humanControlled`, takeover e regras anti-loop |
| P0 | Origem de instância ainda precisa de prova de isolamento na Inbox | Workspace pode ter uma ou várias instâncias; ainda não há filtro operacional | Aplicar escopo no backend e filtro multi-select na UI: uma, várias ou todas |
| P1 | Mensagens estruturadas e mídia precisam de teste E2E real | O recebimento de imagem/áudio funcionou, mas o texto apresentou divergência | Testar cada tipo com `messageId`, `jid`, `instanceId`, status e persistência observáveis |

### Critério de aceite do filtro de instâncias

A Inbox deve consultar apenas instâncias ativas pertencentes ao workspace autenticado. O filtro deve permitir selecionar uma instância, várias instâncias ou todas as instâncias disponíveis. A opção “Todas” deve representar o conjunto permitido pelo backend, não um filtro client-side sobre dados potencialmente vazados.

### Critério de aceite da IA

Definir explicitamente a semântica de mensagem manual: mensagem enviada pelo operador deve pausar/assumir a conversa; mensagem `fromMe` originada pelo próprio número conectado não deve gerar loop; mensagem inbound de outro contato deve seguir a regra normal da IA. Cada transição deve ser persistida e auditável.
