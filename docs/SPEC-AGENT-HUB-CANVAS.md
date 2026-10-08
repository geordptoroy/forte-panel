

## Correção arquitetural confirmada

O fluxo possui **um único Agente de resposta**. Ele é o componente que interpreta o contexto e responde no WhatsApp. Não existe um agente separado por tipo de mensagem e não deve existir um node “Modelo de texto” independente no canvas.

O Switch de entrada apenas identifica o tipo da mensagem. O texto segue diretamente para a normalização/contexto; áudio passa por transcrição; imagem passa por visão; documento passa por extração; vídeo passa por interpretação multimodal. Depois dessas etapas, todas as ramificações convergem para o mesmo **Agente de resposta**.

A conexão de `whatsapp_reply`/rota `text` representa o modelo usado pelo agente, não um node intermediário de texto. Portanto, no canvas:

```text
Entrada Baileys
  → Switch de tipo
      → Texto ───────────────────────┐
      → Áudio → Transcrição ─────────┤
      → Imagem → Análise ────────────┤
      → Documento → Extração ────────┤→ Agente de resposta → Switch de saída
      → Vídeo → Análise multimodal ──┘
```

O agente deve aparecer uma única vez. O node do agente pode exibir, ao ser aberto, o modelo/rota de resposta, prompt global, `maxSteps` e fallbacks; as etapas multimédia anteriores exibem apenas a capability específica de interpretação. Nenhum Switch deve abrir configuração de provider/modelo.
