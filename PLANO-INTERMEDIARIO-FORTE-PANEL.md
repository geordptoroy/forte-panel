

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
