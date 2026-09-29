

## 29. IA do Console Admin ativa por instância — 2026-09-29

A IA deixou de ficar apenas preparada. O worker agora lê o `instanceId` do evento `message.received`, localiza o prompt global pareado àquela instância e executa o mesmo `runNativeAgent`/provedor LLM já usado pelo Workspace. O vínculo controla `enabled`, modelo, limite de etapas e system prompt; a política global da plataforma continua sendo o gate superior.

Foi criada a aba **Prompts por instância** na sidebar do Console Admin, em `/platform-admin/prompts`. Ela permite ler e editar o prompt global padrão, selecionar uma instância WhatsApp, editar o prompt daquela conexão, ativar/pausar o agente e acompanhar a versão salva. O salvamento permanece auditado e versionado.

O comportamento esperado para o smoke test é: configurar o prompt global, selecionar a instância conectada, salvar o vínculo como ativo, enviar uma mensagem recebida no WhatsApp e confirmar que o agente responde no Inbox/WhatsApp usando aquela instância. O agente respeita o controle de IA do contato e da conversa: se estiver pausado ou sob controle humano, não responde.

Gates executados nesta fase: `pnpm check`, `pnpm build`, 12 testes focados de bootstrap, Console Admin e interatividade, e `git diff --check`.
