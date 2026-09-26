

## Etapa 5 — Claim atômico de idempotência HTTP — concluída

A idempotência das rotas mutáveis deixou de usar o padrão inseguro `SELECT` antes do handler e `INSERT` depois do handler.

Agora o fluxo é:

1. `INSERT ... ON CONFLICT DO NOTHING` cria a chave em estado `processing`.
2. Apenas a requisição que conseguiu inserir executa o efeito.
3. Requisições concorrentes com o mesmo payload recebem `idempotency_in_progress` e `Retry-After: 2`.
4. Ao concluir, o registro passa a `completed` e guarda status/body para replay.
5. Payload diferente para a mesma chave continua retornando conflito.
6. Se o processo cair, o lease expira e uma nova tentativa pode reassumir a chave.

A tabela ganhou `status`, `leaseUntil` e `updatedAt`. Migration:

```text
drizzle-pg/0014_api_idempotency_claim.sql
```

Isso protege contatos, memória de lead, agendamentos, mensagens, lotes, mudança de etapa e cancelamentos que usam o helper HTTP `idempotent`.

Validação: typecheck, testes, build, journal JSON e diff check passaram. O teste de concorrência com PostgreSQL real continua planejado para a suíte de integração, sem exigir ação manual do usuário.

## Handoff de continuidade

Foi criado `HANDOFF-CONTINUIDADE-FORTE-PANEL.md` com o contexto completo para outra IA: decisões de arquitetura, commits, migrations, variáveis, comandos WSL/Docker, estado real da auditoria, limitações, smoke test adiado e próximo bloco recomendado.

## Etapa 6 — Ledger idempotente das tools do agente — concluída

Foi criada a tabela `agentEffects` com chave única por `workspaceId + eventId + toolCallId`. Ela guarda fingerprint dos argumentos, status, resultado estruturado e lease expirável.

As tools mutáveis protegidas são `atualizar_lead`, `registrar_nota`, `criar_agendamento` e `transferir_humano`. As consultas `buscar_lead` e `consultar_agenda` não criam efeitos.

Se uma tool já foi concluída, o resultado salvo é reproduzido. Se outra execução possui o lease, o efeito não é executado novamente. O reset de desenvolvimento também limpa o ledger.

Migration: `drizzle-pg/0015_agent_effects.sql`.

Validação: `pnpm check`, `pnpm test` (39 aprovados; 13 ignorados), `pnpm build`, journal JSON e diff check passaram.

Limitações para a próxima etapa: teste PostgreSQL real de crash/concorrência, estado `unknown` depois de mutação antes de persistir o resultado e fencing de handoff humano.

## Visão de produto comercial — Onboarding Conversacional Assistido por IA

A experiência final desejada é permitir que um cliente configure o Forte Panel sem precisar entender variáveis de ambiente, prompts ou detalhes técnicos. Depois do login inicial, um chat de onboarding conversa com o responsável pela empresa e descobre, em linguagem natural:

- nome, segmento e região da empresa;
- serviços oferecidos;
- público e perfil dos clientes;
- diferenciais, restrições e políticas comerciais;
- horários, profissionais e regras de agenda;
- tom de voz desejado;
- perguntas frequentes e respostas aprovadas;
- limites do agente e situações que exigem atendimento humano;
- canais/instâncias de WhatsApp que serão conectados.

O resultado não deve ser um prompt livre salvo diretamente. O fluxo recomendado é:

```text
chat de descoberta
→ perfil estruturado da empresa
→ rascunho de system prompt + políticas
→ revisão visual pelo proprietário
→ simulação de conversas
→ aprovação explícita
→ publicação de versão do agente
```

### Nome recomendado

Nome técnico da feature: **Onboarding Conversacional Assistido por IA**.

Nomes comerciais possíveis:

- **Configuração Inteligente**;
- **Assistente de Ativação**;
- **Setup Guiado por IA**;
- **DNA da Empresa** — nome mais marcante para o perfil estruturado.

Se “Jev” for o nome de uma ferramenta/produto específico que o usuário tem em mente, validar o contrato e a licença antes de adotá-lo. Por enquanto, o roadmap usa o nome genérico e independente de fornecedor.

### Requisitos de segurança e produto

- O proprietário continua sendo o único aprovador final.
- A IA pode sugerir, mas não publica configuração comercial sem aprovação.
- Toda publicação gera uma versão do prompt e permite rollback.
- Segredos, API keys e credenciais nunca entram no prompt.
- O chat deve separar fatos informados pelo cliente de sugestões inferidas pela IA.
- O cliente pode editar qualquer resposta antes da publicação.
- O agente deve ter limites explícitos: quando transferir para humano, o que não pode prometer e quais ações exigem confirmação.
- Deve existir preview/teste com conversas simuladas antes de ativar.
- O perfil estruturado deve ser reutilizável por prompt, FAQ, treinamento, mensagens e futuras campanhas.

### Fase planejada

Esta é uma fase de **produto comercial**, depois da contenção de segurança, tenancy, confiabilidade do worker e ledger/handoff do agente. O primeiro MVP pode ser implementado sem provisionamento Cloud: usar o agente nativo existente, salvar o perfil estruturado e gerar uma versão revisável do prompt.

## Roadmap de interface — evolução sem alterar o branding

A interface deve evoluir por refinamento, não por redesign. Manter a identidade atual: fundo escuro, superfícies/cards, paleta existente, badges de status, verde para confirmação, âmbar para atenção, vermelho para falha, tipografia, ícones lineares e linguagem visual do Forte Panel.

### Prioridade 1 — Clareza operacional

- reorganizar navegação em Operação, Automação, Configuração e Sistema;
- transformar o dashboard em painel orientado a ações;
- tornar cards do dashboard clicáveis e ligados à ação correspondente;
- criar checklist de configuração inicial;
- substituir estados técnicos por mensagens operacionais traduzidas;
- padronizar loading, erro, retry e empty states;
- impedir que erros apareçam como listas vazias ou números zero.

### Prioridade 2 — Operação diária

- destacar claramente `IA ativa`, `Humano assumiu` e `IA pausada` na Inbox;
- criar ações visíveis `Assumir conversa` e `Devolver para IA`;
- mostrar a instância PAPI que recebeu a mensagem;
- mostrar timeline operacional do agente sem expor raciocínio privado do modelo;
- manter composer e ações essenciais acessíveis no mobile;
- corrigir `.page-actions` e grids rígidos para responsividade.

### Prioridade 3 — Configuração comercial

- criar a tela **Configuração Inteligente**;
- integrar o Onboarding Conversacional Assistido por IA;
- exibir chat de descoberta com progresso;
- mostrar na lateral o perfil estruturado da empresa sendo preenchido;
- separar fatos informados de sugestões da IA;
- permitir revisão, simulação e publicação pelo proprietário;
- criar versionamento e rollback do perfil/prompt.

### Prioridade 4 — Integrações sem complexidade desnecessária

A tela Canais conectados deve ter duas camadas:

1. visão simples: nome, provider, status e uso atual;
2. detalhes avançados: `instanceId`, deployment, webhook, API key mascarada, último erro e sincronização.

IDs, headers e detalhes técnicos não devem dominar a primeira experiência do cliente.

### Prioridade 5 — Qualidade visual e acessibilidade

- consolidar botões, badges, cards e estados em componentes reutilizáveis;
- remover excesso de estilos inline;
- melhorar hierarquia tipográfica e espaçamento;
- adicionar `:focus-visible`;
- adicionar `aria-label` em botões somente com ícone;
- revisar contraste;
- usar animações discretas apenas para transições e feedback;
- fazer code splitting por rota;
- separar `PanelPages.tsx` por domínio.

### Ordem recomendada de implementação

```text
estados/loading/erro/vazio
→ dashboard orientado a ações
→ Inbox IA/humano
→ mobile/responsividade
→ Canais em duas camadas
→ checklist inicial
→ Configuração Inteligente conversacional
→ simulador/versionamento do agente
```

Toda melhoria deve preservar o branding atual e ser validada em desktop e mobile.


---

## Nova direção principal — SaaS público multi-conta e logins de funcionários (2026-09-25)

Esta decisão do usuário **substitui prioridades anteriores de produto que pressupunham uma instalação por empresa com um único login proprietário**. O Forte Panel passa a ser planejado como app público: uma conta master cria uma empresa/workspace e pode criar acessos individuais para funcionários com nome, identificador e senha inicial; cada membro tem papel/permissões e a sessão deve ser revogável.

Não confundir:

- conta master/funcionário = identidade de login;
- empresa/workspace = tenant e fronteira dos dados;
- instância/conexão WhatsApp = canal vinculado ao tenant.

A estratégia detalhada, definições, critérios de aceite e fases está em `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`. O primeiro bloco de código passa a ser **tenancy real, contexto de workspace validado por membership, revogação de sessão e testes PostgreSQL de isolamento**; em seguida, cadastro/login master e gestão de funcionários. O projeto já tem hashes, memberships e papéis internos reutilizáveis, mas ainda precisa remover o bootstrap global e dependências do workspace demo/global.

### WhatsApp próprio — fase futura, condicionada

O usuário informou que a PAPI usada já é construída sobre Baileys e propôs usar Baileys ou o repositório `intrategica/papi-free:1.5.1` como base para construir uma API REST própria. O repositório usa `intrategica/papi-free:1.5.2` nos Compose mais atuais; a tag 1.5.1 está publicada, porém anterior. O Docker Hub consultado não mostra source repo nem licença da imagem. Portanto, **não fazer fork nem distribuir/modificar a imagem até confirmar código-fonte, licença e autorização com o mantenedor**. O MIT do projeto Baileys não cobre a PAPI.

O futuro gateway REST pode ser um fork autorizado da PAPI (preferível se houver fonte/licença adequadas) ou serviço próprio sobre Baileys. Deve permanecer um serviço/adapter isolado, com storage de autenticação em banco durável e criptografado, QR protegido, reconexão/locks, callbacks assinados, idempotência, monitoramento e migração reversível. A PAPI atual permanece como provider de transição e Meta Cloud API como alternativa oficial. Revisar termos e riscos do provider não oficial antes de beta comercial. Não implementar Baileys nesta fase.

### Sequência ativa

1. Preparar mapa de tabelas/rotas/queries que exigem tenant e plano de backfill sem perda dos dados demo existentes.
2. Corrigir contexto de usuário/master e workspace/membership.
3. Fazer teste com dois tenants e provar isolamento de rotas, workers, storage, webhooks e mensagens.
4. Implementar onboarding público/master e gestão de logins/papéis.
5. Validar o provider WhatsApp atual por workspace.
6. Só depois avaliar o fork/API própria PAPI/Baileys e o lançamento gradual.

A tarefa de fencing/ledger PostgreSQL continua válida como requisito de confiabilidade antes do uso comercial do agente, mas deixa de ser o próximo bloco isolado: deve ser encaixada após a fronteira de tenancy e login estar segura.

---

## Atualização de execução — 2026-09-26

A migração de tenancy avançou para o domínio CRM/Inbox. Contatos, conversas, mensagens, notas, lead-memory, inbound/outbound, seleção de canais e chamadas do agente agora propagam `workspaceId` explícito a partir do contexto tRPC, da API REST vinculada e do evento do worker. A superfície REST mantém fail-closed sem `FORTE_API_WORKSPACE_ID`, sem alterar o contrato de validação de payload/idempotência.

Validação concluída: `pnpm check`, `pnpm test` (43 aprovados, 19 ignorados sem PostgreSQL), `pnpm build` e `git diff --check`.

Próxima sequência: migrar onboarding/configuração e gestão histórica de instâncias PAPI; depois versionar migration para `auditLogs`, `webhookEvents` e `apiIdempotency` com escopo composto por workspace; executar isolamento com PostgreSQL real antes de abrir novos tenants.

---

## Atualização de execução — 2026-09-26 09:58

Onboarding, prompt publicado, configuração/runtime do agente e gestão de instâncias/webhooks PAPI foram migrados para `workspaceId` explícito. O armazenamento PAPI não aceita mais chamadas sem tenant e o fallback global de `PAPI_INSTANCE_ID` foi removido do caminho tenant-aware.

Decisão operacional para beta: uma chave de provedor mantida no backend pode servir várias empresas/conversas; a separação deve ser feita por autenticação, membership, workspace, rate limit, quota e observabilidade do Forte Panel. Não distribuir a chave do provedor aos testadores. Próximo bloco: migration de auditoria/idempotência/eventos composta por workspace, limites por tenant e teste PostgreSQL de isolamento.

---

## Atualização de execução — 2026-09-26 10:03

Foi adicionada a proteção operacional inicial do beta: buckets persistidos por minuto e workspace, limites REST e de execução da IA, headers de rate limit e reentrega adiada de eventos quando a cota da IA é atingida. A migration é `0016_workspace_usage_buckets.sql` e o teste de isolamento está em `server/workspace-usage.test.ts`.

Defaults: 120 requests REST/minuto e 60 execuções de IA/minuto por workspace, configuráveis por `FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE` e `FORTE_WORKSPACE_AI_REQUESTS_PER_MINUTE`. Próximo bloco: aplicar migration em PostgreSQL real, verificar concorrência, adicionar limites por plano/usuário e fechar escopos compostos de auditoria/idempotência/webhooks.

---

## Atualização de execução — 2026-09-26 10:11

Foi concluída a migração do núcleo de deduplicação para escopo composto por workspace. Idempotência REST, eventos de webhook, domain events e auditoria não dependem mais de chaves globais; a auditoria voltou a ser exibida apenas ao workspace atual.

A migration `0017_tenant_scoped_deduplication.sql` contém backfill seguro com fallback explícito para `forte-demo`. Próximo passo operacional: aplicar em PostgreSQL real, validar o backfill e a concorrência dos índices compostos; depois revisar isolamento de tokens/segredos e implementar limites por plano/usuário.

---

## Atualização de execução — 2026-09-26 10:14

A revisão de segredos foi concluída. A cópia dos segredos de webhook PAPI em `workspaceSettings` agora usa AES-256-GCM, respostas do frontend permanecem mascaradas e foi adicionada cobertura unitária contra exposição e ciphertext adulterado.

Antes do beta, configurar `JWT_SECRET` forte e persistente no servidor, aplicar as migrations 0016/0017 no PostgreSQL real e executar as suites de isolamento com dois workspaces.

---

## Atualização de execução — 2026-09-26 10:19

Foi adicionada política de limites por plano e bucket individual por operador. O endpoint manual do Inbox já impede que um único usuário consuma toda a capacidade do workspace. A migration 0018 cria a persistência do bucket individual.

Próximo passo: executar as três migrations em PostgreSQL real, validar concorrência entre usuários e criar uma visão operacional de consumo antes de abrir o beta.

---

## Atualização de execução — 2026-09-26 10:22

A tela de Integrações passou a exibir o consumo do workspace e dos operadores, com limites derivados do plano e atualização automática. O endpoint usa `requireManager`, mantendo a visibilidade operacional restrita a gestores.

Próximo passo: validar as migrations em PostgreSQL real e fechar o limite do worker outbound.

---

## Atualização de execução — 2026-09-26 10:45

O worker agora aplica o limite de outbound do workspace antes do envio externo. Mensagens limitadas permanecem na fila sem consumir tentativa, sendo retomadas na janela seguinte.

Próximo passo: validação em PostgreSQL real e alertas operacionais de consumo.

---

## Atualização de execução — 2026-09-26 10:53

O sistema ganhou alertas in-app de consumo em 70% e 90%, entregues aos responsáveis ativos e deduplicados por janela, métrica e threshold. A documentação do beta foi consolidada no manual operacional e no índice de documentação.

Próximo passo: executar build final, publicar este bloco e realizar a validação real das migrations e concorrência em PostgreSQL.

---

## Atualização de execução — 2026-09-26 11:03

A validação PostgreSQL que estava pendente foi executada localmente. Migrations, constraints de tenancy, isolamento entre dois workspaces, quotas e alertas foram exercitados; 72 testes passaram sem skips.

Próximo passo: repetir migrations e a mesma suíte no staging real, sem apagar volumes, antes de convidar os 10 beta testers.

---

## Atualização de execução — 2026-09-26 11:24

Foi adicionada retenção diária dos buckets de consumo, configurável por `FORTE_USAGE_RETENTION_DAYS` e protegida por teste PostgreSQL. O padrão de 30 dias evita crescimento indefinido antes do beta.

Próximo passo: validar no staging e observar o custo/volume real.

---

## Atualização de execução — 2026-09-26 11:27

Foi adicionado healthcheck/readiness para a API e heartbeat periódico do worker. A suíte PostgreSQL passou com 74 testes e o typecheck passou.

Próximo passo: instalar esses sinais no staging real e confirmar que o monitoramento diferencia processo vivo de serviço pronto.

---

## Atualização de execução — 2026-09-26 11:31

Foi documentado e priorizado como P0 o Console Administrativo da Plataforma. Ele deve entrar antes do beta real e inclui gestão de contas, suporte escopado, observabilidade por workspace e configuração versionada do agente.

O documento consolidado é `STATUS-COMPLETO-E-PLANO-BETA.md`. O próximo bloco de implementação deve criar as permissões de plataforma, as sessões de suporte e o CRUD de rascunho/publicação/rollback do agente.
