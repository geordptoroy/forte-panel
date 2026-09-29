

## IA do Console Admin por instância — 2026-09-29

Abra **Console Admin → Prompts por instância**. Edite e salve o prompt global padrão; depois selecione a instância Baileys já conectada, revise o texto herdado, escolha **Ativo — responder no chat** e salve o vínculo. O vínculo deve mostrar a versão e a data de atualização. A aba IA global continua sendo a fonte das conexões/modelos; a nova aba controla o prompt e o estado por instância.

Para o smoke test, envie uma mensagem de texto ao WhatsApp da instância. Confirme que o evento recebido contém a mesma `instanceId`, que a conversa aparece no Inbox do Console Admin e que a resposta do agente chega pelo WhatsApp. Se o contato estiver com IA pausada ou a conversa em controle humano, a ausência de resposta é esperada. Para reativar, habilite a IA do contato/conversa e envie uma nova mensagem.
