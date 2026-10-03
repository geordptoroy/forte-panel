# Roadmap do Console Admin de suporte

> **DOCUMENTO HISTÓRICO — revisto em 2026-10-02.** Este ficheiro preserva decisões e evidências de um estado anterior e não define o produto ou os procedimentos atuais. O único canal do produto é Baileys. Não executar opções de canal, comandos, branches, tags ou tarefas pendentes daqui; consultar `AGENTS.md`, `PRODUCT_SCOPE.md`, `docs/STATUS-ATUAL.md` e `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`.





**Atualizado em:** 29/09/2026  
**Status:** direção confirmada; as áreas de suporte ainda devem ser implementadas com escopo administrativo próprio.

> **Decisão confirmada:** o Console Admin terá páginas acessíveis pela própria sidebar para **Instâncias, Inbox, Agenda e Funil**. Elas são ferramentas de suporte que operam sobre o workspace selecionado, não atalhos para o workspace público do cliente.

## Decisões incorporadas

Estas decisões foram extraídas da arquitetura conceitual e mantidas somente quando são úteis para o código atual:

1. **Workspace é a fronteira absoluta de dados.** Toda consulta, mensagem, instância, contato, agenda e ação de suporte deve carregar `workspaceId`.
2. **Console Admin é uma superfície separada do painel do cliente.** Ele pode operar sobre vários workspaces, mas não deve receber um workspace implícito nem misturar dados na mesma consulta.
3. **Ações de suporte usam sessão explícita.** Toda leitura ou mutação operacional deve carregar `platformAdminId`, `workspaceId` e, quando aplicável, `supportSessionId`.
4. **Dois modos são necessários:** `read_only` para diagnóstico e `operator` para ações operacionais autorizadas.
5. **Toda mutação administrativa deixa auditoria.** O registro deve conter administrador, workspace, ação, motivo, horário, resultado e escopo da sessão.
6. **O Console reutiliza contratos existentes quando possível.** Não duplicar regras de Inbox, agenda, contatos ou Baileys; criar fachadas administrativas que imponham o escopo e a auditoria.
7. **Baileys é o único provider WhatsApp operacional.** O Console Admin não deve reintroduzir seleção PAPI/Meta ou um provider genérico.
8. **Diagnóstico deve ser seguro por padrão.** Credenciais permanecem mascaradas; dados de outros workspaces só aparecem após seleção explícita; ações destrutivas exigem uma confirmação própria.

## O que não foi incorporado agora

As seguintes ideias permanecem como backlog ou exigem decisão e infraestrutura que ainda não estão comprovadas no repositório:

- MRR, churn, cobrança e planos completos;
- 2FA, allowlist de IP e reautenticação crítica;
- OpenTelemetry, tracing distribuído e agrupamento tipo Sentry;
- revelar credenciais, mesmo com auditoria;
- espelhamento automático completo de um workspace e cópia de RAG/conversas;
- replay de mensagens com efeitos externos;
- métricas de custo de IA não comprovadas pelo caminho atual.

Não tratar essas ideias como funcionalidades disponíveis nem como critério do smoke test atual.

## Sequência de implementação

### Fase A — Workspace de suporte e instâncias

**Progresso:** a visibilidade read-only das instâncias Baileys no detalhe do workspace foi publicada em `6937a2a`. As mutações de pareamento e desconexão continuam pendentes.

- listar workspaces com status e busca;
- abrir o detalhe de um workspace com identificação sempre visível;
- listar instâncias Baileys daquele workspace;
- exibir status, telefone, `instanceId`, última atualização e erros resumidos;
- iniciar conexão/pareamento e desconexão somente em modo `operator`;
- impedir qualquer consulta por `instanceId` sem validação do `workspaceId` selecionado.
- criar instância Baileys dentro de sessão `operator`, com auditoria, para que o smoke test não dependa do terminal.

### Fase B — Inbox de suporte

- listar conversas do workspace selecionado;
- visualizar mensagens, contatos e estado de leitura;
- respeitar o filtro de instâncias já existente na Inbox;
- permitir envio apenas em sessão `operator` ativa;
- exibir claramente workspace, modo da sessão e expiração;
- registrar envio, leitura e ações de suporte na auditoria.

As páginas administrativas não devem montar o contexto a partir da membership do usuário. Devem receber o workspace e a sessão explicitamente e exibir ambos no cabeçalho.

### Fase C — Operação de negócio

- contatos e histórico;
- agenda e agendamentos;
- funil/Kanban;
- notas internas de suporte;
- indicadores operacionais simples, somente quando derivados de dados reais.

### Fase D — Diagnóstico avançado

- saúde da instância e outbox;
- eventos e erros do webhook;
- estado de filas e retries;
- diagnóstico de IA com dados mascarados;
- simulador sem efeitos externos.

## Critérios de aceite do Console Admin

- Uma conta de workspace nunca acessa rotas administrativas.
- Um admin sem `supportSession` não consegue operar dados de workspace.
- `read_only` não cria, edita, envia, desconecta ou publica.
- `operator` só age no workspace da sessão ativa e dentro da validade.
- Consultas de workspace A nunca retornam instância, conversa, contato ou mensagem de B.
- O breadcrumb/cabeçalho mostra workspace, modo, administrador e expiração.
- Falha de auditoria impede a conclusão de uma mutação crítica.
- Cada fase passa por typecheck, testes negativos de isolamento, build e CI antes de ser disponibilizada no Docker `:dev`.

## Relação com o smoke test

O smoke test Baileys real continua sendo um gate separado. Depois da Fase A e do mínimo da Fase B, repetir:

1. health/readiness do gateway;
2. estado da instância pareada;
3. recebimento de texto real;
4. envio de texto real para segundo número de teste;
5. confirmação da Inbox e do estado da outbox;
6. verificação de que a ação ocorre no workspace correto.
