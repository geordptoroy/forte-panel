

## Próxima fase: interatividade e prompts globais — 2026-09-29

Depois de confirmar o fluxo já congelado de conexão Baileys, Inbox, texto, áudio e imagem, validar no Console Admin uma mensagem de botões com uma a três opções, uma lista e uma enquete. Confirmar que cada mensagem é persistida com o tipo correto, segue pela mesma `instanceId` de origem e aparece na conversa sem alterar a ordem dos testes anteriores. Payload inválido deve falhar antes do gateway.

Na área de instâncias de suporte, selecionar uma conexão, editar o prompt global, salvar e confirmar a versão incremental e o evento de auditoria. O editor informa explicitamente que o pareamento não liga respostas automáticas. Carrossel permanece bloqueado até existir adapter/provider compatível com Baileys; não considerar uma tentativa de payload cru como teste aprovado.
