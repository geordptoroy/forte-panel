# Estratégia do Forte Panel para produto público multi-conta

**Status:** estratégia aprovada para orientar os próximos passos; ainda não é autorização para ligar serviços externos, provisionar contas WhatsApp ou publicar o produto.
**Atualizado:** 2026-09-25
**Repositório:** `geordptoroy/forte-panel` (consulte `git log -1` para o HEAD vigente)
**Leitura complementar:** `PRODUCT_SCOPE.md`, `todo.md`, `PLANO-INTERMEDIARIO-FORTE-PANEL.md` e `HANDOFF-CONTINUIDADE-FORTE-PANEL.md`.

## 1. Direção escolhida

O Forte Panel deixa de ser tratado como um painel de uma única empresa/instalação e passa a ser planejado como **um aplicativo SaaS público, multiempresa e multi-login**, para o cliente final usar sem programar nem editar Compose ou variáveis de ambiente.

O caminho do cliente deve ser:

```text
página pública do Forte Panel
→ criar conta master
→ criar a empresa/workspace (tenant)
→ configurar a operação por um onboarding guiado
→ conectar um canal/instância WhatsApp
→ criar acessos para funcionários
→ operar Inbox, CRM, agenda e automações
```

A primeira entrega pública deve ser pequena, segura e compreensível. “App completo” é o objetivo de produto; não significa liberar todas as integrações e automações antes de estabelecer isolamento, autenticação, recuperação e suporte operacional.

## 2. Vocabulário: separar três coisas chamadas “conta/instância”

1. **Conta de usuário:** identidade que faz login. Pode ser a conta master ou de funcionário.
2. **Empresa/workspace/tenant:** os dados e configurações de uma empresa. A primeira versão comercial começa com **um workspace por conta master**. A empresa não ganha um servidor separado.
3. **Instância/conexão WhatsApp:** sessão/número WhatsApp ligado à empresa por um provider, como a PAPI atual, uma futura PAPI própria baseada em Baileys ou a API oficial da Meta.

No primeiro plano comercial, cada workspace poderá conectar **uma instância WhatsApp**. O limite precisa ser configurável por plano mais adiante; múltiplos números podem ser habilitados depois sem mudar a fronteira de segurança.

> A palavra “instância” não deve ser usada sozinha nas telas. Escrever “empresa/workspace” para o tenant e “conexão WhatsApp” para a sessão/número.

## 3. Papéis e logins

### Conta master (proprietário da empresa)

A conta master cria a empresa e é a responsável por ela. Pode:

- completar o cadastro da empresa e escolher fuso/segmento;
- conectar, desconectar e administrar a conexão WhatsApp permitida;
- criar, editar, desativar e reativar logins de funcionários;
- definir função de cada funcionário e vínculo com profissional;
- redefinir senha e encerrar sessões de funcionários;
- configurar IA, catálogo, horários, agenda e integrações;
- visualizar auditoria e solicitar exportação/encerramento da conta.

O master **não** é um superusuário global do sistema. Uma conta interna de suporte da plataforma, se vier a existir, será separada, mínima, auditada e sem acesso rotineiro ao conteúdo do cliente.

### Funcionários

O master pode criar logins de funcionários com **nome, identificador de login e senha inicial**. O login de funcionário não precisa ter e-mail na primeira versão, desde que haja procedimento seguro de recuperação pelo master.

- Cada funcionário é usuário individual — não compartilhar uma conta da equipe.
- O identificador de login deve ser inequívoco (por exemplo, nome de usuário único ou código da empresa + usuário).
- A senha só é aceita na criação/alteração; o banco armazena somente hash lento e salgado, nunca texto puro.
- Senha inicial deve ser temporária, com troca obrigatória no primeiro acesso; se essa UX não couber no primeiro marco, o master deve poder redefinir e invalidar sessões imediatamente.
- Desativar um acesso bloqueia novas requisições e invalida sessões existentes.
- Recuperação sem e-mail deve ser feita pelo master e auditada; recuperação por e-mail verificado pode entrar depois.

Papéis de acesso no workspace, mantendo a base existente:

- **owner/master:** controle da empresa e da equipe;
- **admin:** operação administrativa delegada, sem trocar propriedade da conta;
- **manager:** supervisão operacional;
- **agent:** atendimento, limitado pelas permissões;
- **perfil operacional:** atendente humano, agente de IA ou profissional executor. Esse atributo define o fluxo de trabalho, não substitui o papel de acesso.

Permissões são aplicadas no servidor em cada consulta e mutação. Esconder um botão na interface nunca conta como autorização.

## 4. O que já existe e o que ainda falta

O código atual já tem partes que podem ser aproveitadas:

- senha local com hash scrypt;
- login por e-mail/senha em modo local;
- criação de contas locais de equipe;
- associação `workspaceMembers` e papéis owner/admin/manager/agent;
- perfil operacional e associação a profissional;
- habilitar/desabilitar membros;
- UI inicial de equipe e troca de senha.

Isso **não equivale a SaaS multi-conta pronto**. Hoje o login local depende de `LOCAL_AUTH_ENABLED` e senha master de ambiente, há bootstrap administrativo global, e muitos helpers ainda resolvem o workspace demo/global. A criação de funcionário usa e-mail atualmente, e ainda falta fluxo público de cadastro master, tenant próprio por sessão, recuperação, limite de usuários e prova de isolamento entre empresas.

A implementação deve evoluir as entidades existentes com migrations e backfill — não criar um segundo sistema de login paralelo nem remover dados atuais.

## 5. Estratégia futura para WhatsApp próprio (PAPI/Baileys)

### Intenção do usuário

A PAPI utilizada hoje já é entendida pelo usuário como baseada em Baileys. A meta futura é reduzir dependência externa e controlar a integração, avaliando **construir/forkar a API REST própria a partir do código-fonte autorizado da PAPI** ou, se isso não for possível, criar um serviço separado que use Baileys diretamente.

### O que foi verificado nesta revisão

- O repositório principal do Forte Panel já usa a imagem `intrategica/papi-free:1.5.2` nos Compose mais atuais; a tag `1.5.1` também existe no Docker Hub, mas é anterior. Não fixar 1.5.1 só por ter sido mencionada sem comparar comportamento e segurança.
- Docker Hub publica a imagem como `intrategica/papi-free`, porém os metadados visíveis não apontam um repositório-fonte (`source` vazio) nem descrevem a licença da imagem. A busca pública GitHub por repositórios da organização/termo também não encontrou fonte correspondente. Isso não prova que o código não exista; significa que **a origem e os direitos de modificação/redistribuição ainda precisam ser confirmados com o mantenedor**.
- A imagem Docker não é, por si só, código-fonte que possa ser estendido com segurança. Uma camada sobre imagem opaca pode personalizar configuração, mas não é um fork sustentável do serviço.
- O Baileys é uma biblioteca independente que fala o protocolo WhatsApp Web por dispositivos vinculados; não é WhatsApp Business Platform/Cloud API nem produto oficial/endorsado pelo WhatsApp. Seu repositório declara licença MIT para o próprio Baileys, mas isso **não define a licença da PAPI ou da imagem PAPI**.
- A documentação do Baileys desaconselha `useMultiFileAuthState` em produção e recomenda um armazenamento de autenticação próprio, apoiado em banco. Credenciais e chaves Signal são segredos de longa duração.
- Os Termos oficiais do WhatsApp descrevem restrições a usos não autorizados e a mensagens em massa/automatizadas e reservam medidas como desativação/suspensão. O risco de desconexão/bloqueio de números e mudanças do protocolo precisa ser tratado como risco de produto/compliance, não escondido do cliente.

### Alternativas a comparar no portão de decisão

| Alternativa | Vantagens | Trade-offs/riscos | Esforço operacional |
|---|---|---|---|
| Manter a PAPI atual como provider | Menor mudança; preserva o fluxo já testado e permite lançar o SaaS antes | Dependência do fornecedor, de suas versões e do contrato de suporte; estabilidade e comportamento vêm de fora | Baixo no curto prazo; manter monitoramento e adapter |
| Fork próprio da PAPI, após obter fonte e permissão | Reutiliza REST, QR e gestão de sessões existentes; maior controle gradual sem reescrever tudo | Só é viável se fonte, licença, build, dependências e direito de distribuição forem confirmados; herda dívida e atualizações do upstream | Médio/alto: manter fork, imagem assinada, atualização, segurança e compatibilidade |
| Serviço REST próprio diretamente sobre Baileys | Controle do contrato e da evolução; menor dependência de API proprietária | Exige implementar QR, sessões, mensagens, webhooks, reconexão, stores de chaves, idempotência, limites e operação; risco de protocolo não oficial permanece | Alto e contínuo: worker sempre ativo, persistência segura, escala e suporte |

A estratégia neste momento **não escolhe nem implementa** fork ou serviço Baileys. Primeiro confirmar a fonte/licença da PAPI; manter o provider existente como caminho de referência. A troca precisa ser reversível por adapter e por workspace.

### Arquitetura-alvo se a opção própria for aprovada

O serviço de conexão WhatsApp será um componente isolado do servidor web do CRM:

```text
Forte Panel (tenant, usuários, CRM, UI)
       │ contrato provider neutro e autenticado
       ├── PAPI atual (provider de transição)
       ├── PAPI própria/fork OU gateway Baileys (futuro)
       └── Meta WhatsApp Cloud API (opção oficial)
```

Requisitos mínimos antes de produção:

- uma única conexão ativa por instância WhatsApp; lock distribuído/lease para impedir dois sockets concorrentes;
- autenticação forte service-to-service, credencial separada por workspace/instância, autorização por escopo e rate limits;
- QR/pairing exibidos apenas ao owner/admin, expiração curta, proteção contra replay e remoção do QR de logs;
- guardar credenciais e todas as chaves Signal em armazenamento durável, criptografado por chave de gestão de segredos, com acesso mínimo e backup/restore testados;
- nunca usar `useMultiFileAuthState` como persistência de produção, nem versionar arquivos de sessão;
- contrato REST versionado para criar sessão, obter estado/QR, desconectar, health, enviar texto/mídia e receber eventos;
- inbound assinado, deduplicado e associado ao tenant/instância antes de entrar no CRM;
- outbound por fila, idempotência, limites de taxa, controle de `fromMe`, estados claros e retry que não gere mensagens duplicadas;
- estado observável: aguardando QR, conectado, reconectando, desconectado, credencial revogada, erro; alertar o master sem exibir segredos;
- logs sem conteúdo/segredos por padrão, auditoria de ações e controles de retenção/exportação;
- builds reprodutíveis, digest pin, SBOM, scan de vulnerabilidade, atualização de dependências e procedimento de rollback;
- alternativa oficial da Meta disponível/documentada e aviso transparente sobre risco de provider não oficial.

## 6. Fases de desenvolvimento — ordem para reduzir retrabalho

### Fase 0 — Decisões e organização (agora)

- Este documento passa a ser a estratégia canônica.
- Confirmar o modelo master → empresa/workspace → funcionários e a distinção da conexão WhatsApp.
- Marcar PAPI atual como provider de transição e Baileys/PAPI própria como futuro condicionado a source/license assessment.
- Não alterar ainda a PAPI, não cadastrar dependência Baileys no backend do CRM, não publicar nem provisionar números.

**Pronto quando:** todos os docs ativos deixam de falar em proprietário único por instalação como limite do produto, e o roteiro técnico começa por tenancy/login. A decisão está registrada; a implementação segue nas fases abaixo.

### Fase 1 — Segurança do login e tenancy real (**primeiro bloco de implementação**)

1. Criar um registro claro de tenant/empresa e relação com owner/master; backfill do workspace demo atual para owner existente sem apagar dados.
2. Desativar bootstrap global do primeiro admin para cadastro público; criar fluxo controlado de primeiro master.
3. [x] Corrigir o JWT para realmente incluir `sessionVersion`; a claim assinada é comparada ao banco, e troca de senha/desativação incrementa a versão. Testes de regressão locais cobrem a inclusão e o valor padrão.
4. [x] Remover concessão automática de membership `owner` a usuários OAuth comuns; só o bootstrap configurado/admin pode reivindicar a instalação vazia.
5. [x] Introduzir resolução de workspace único a partir de membership ativa no middleware tRPC; usuário sem ou com múltiplos workspaces ativos falha fechado. Login local, `workspace.current` e notificações iniciais consomem o contexto validado.
6. [x] Migrar o domínio de equipe, catálogo, profissionais e disponibilidade para receber `workspaceId` explícito dos procedimentos autenticados; criação de funcionário não promove papel global de admin. O teste multiworkspace foi criado, mas foi ignorado neste ambiente sem `DATABASE_URL`.
7. Migrar as demais queries/mutações por domínio: restam 42 referências a `ensureDemoWorkspace` no servidor. A auditoria legada, sem `workspaceId` na tabela, fica temporariamente sem leitura pela UI até receber migration/backfill seguro. Não criar/publicar acesso a novos tenants.
8. Auditar tRPC, REST, worker, webhooks, storage, auditoria, settings, contactos, mensagens, agenda, integrações e agente para não ler/escrever fora do tenant.
9. Executar em PostgreSQL real o teste de duas empresas e acrescentar tentativas de cruzar IDs manualmente em cada domínio migrado.
10. Migrations reversíveis, índices/unique/FKs após validar os dados existentes.

**Aceite:** duas empresas no mesmo banco não veem nem alteram nada uma da outra; owner e membro desativado têm o comportamento esperado; suites críticas executam em CI com PostgreSQL.

### Fase 2 — Multi-login de master e funcionários

1. Cadastro e login master por e-mail/senha, com verificação de e-mail como requisito antes de produção pública.
2. Criar funcionários com nome, username/identificador e senha inicial temporária; armazenar apenas hash.
3. Tela para adicionar/editar/desativar acessos e atribuir papéis; nunca conceder owner automaticamente.
4. Troca de senha no primeiro login, recuperação/reset controlado pelo master e revogação de sessões.
5. Rate limit, mensagens de erro que não revelem se usuário existe, bloqueio progressivo, proteção CSRF/cookies seguros e auditoria.
6. Restringir sessões, rotas e dados pela membership ativa em todos os requests.

**Aceite:** master consegue operar sem suporte técnico; funcionário só enxerga o permitido; desativar ou redefinir acesso tem efeito imediato; nenhuma senha é recuperável a partir do banco.

### Fase 3 — Onboarding e empresa pronta para uso

1. Após cadastro, criar workspace e defaults seguros automaticamente.
2. Configurar nome, segmento, timezone, serviços, profissionais, equipe e horários via checklist/assistente em português simples.
3. Separar setup do agente de credenciais; mostrar o que está conectado, o que falta e como corrigir.
4. Permitir testar conversas em modo de simulação; owner aprova publicação do prompt.
5. Oferecer estados vazios úteis, mobile, acessibilidade e mensagens sem jargão de infraestrutura.

**Aceite:** um cliente não técnico configura o CRM principal sem editar arquivos, com conteúdo inicial coerente e caminho de ajuda.

### Fase 4 — Instância WhatsApp segura por tenant

1. No lançamento limitado, integrar uma conexão WhatsApp por workspace pelo provider que estiver aprovado e estável.
2. Credenciais e webhooks isolados por tenant; onboarding com status/QR e instruções claras.
3. Garantir idempotência, `fromMe`, roteamento por instância, takeover humano, auditoria, monitoramento e recuperação.
4. Validar end-to-end em staging com autorização e números de teste; plano de rollback para PAPI atual.
5. Só então fazer o assessment/fork da PAPI ou protótipo técnico isolado Baileys.

**Aceite:** recebe e envia mensagens, não duplica em retry, respeita handoff humano, recupera sessão de forma testada e não cruza tenant.

### Fase 5 — Gateway REST próprio (trabalho futuro)

1. Obter confirmação de repositório, licença, acesso ao código, direitos de fork e redistribuição da PAPI Free.
2. Inventariar endpoints, autenticação, stores, migrations, dependências, comportamento e vulnerabilidades da versão escolhida; comparar `1.5.1` com a versão atual usada pelo projeto (`1.5.2`).
3. Fazer protótipo isolado, sem usuário real: pairing, reconexão, persistence store de banco, inbound/outbound e webhook assinado.
4. Testar crashes, retry/duplicidade, reboot, logout, rotação, cópia de backup, restore e concorrência de workers.
5. Escolher fork PAPI se a fonte/licença forem adequadas; se forem opacas/incompatíveis, decidir conscientemente entre manter provider e criar serviço Baileys próprio.
6. Manter adapter no Forte Panel, contrato versionado e migração reversível por tenant; migrar uma conta de teste por vez.
7. Fazer revisão de segurança, compliance, privacidade e termos antes de oferecer a opção a clientes.

**Não converter um container opaco em dependência central sem fonte, licença, digest e plano de atualização.**

### Fase 6 — Lançamento público e operação

- landing page, cadastro, suporte e onboarding;
- backups e restauração comprovada;
- logs, alertas, métricas, health/readiness e resposta a incidentes;
- limites antiabuso, quotas e controles de envio;
- política de privacidade, termos, consentimento, retenção e exclusão de dados revisados;
- plano comercial e cobrança decididos pelo proprietário do produto, depois de validar custo/uso e experiência;
- suporte para exportar dados, trocar conexão e encerrar conta;
- rollout gradual, beta fechado, monitoramento e rollback.

## 7. Primeiro bloco de trabalho recomendado

**Não começar pelo Baileys nem por reformular telas.** O primeiro bloco de código deve estabelecer o modelo master/tenant e corrigir isolamento/autenticação, pois funcionários, conversas, canais e sessões WhatsApp dependem dessa fronteira.

Antes de alterar schema, preparar uma matriz de rotas/queries com `workspaceId`, um plano de backfill do workspace atual e testes com banco PostgreSQL real. Em seguida, implementar por fatias pequenas:

1. sessão/master e tenant resolvidos corretamente;
2. leitura de perfil/empresa e equipe;
3. Inbox/CRM/agenda com escopo explícito;
4. chaves da API/webhooks e instâncias WhatsApp por tenant;
5. operação com observabilidade e testes de regressão.

## 8. Critério para chamar o produto de completo para o público final

- cadastro/login master e login individual para funcionários;
- empresa/workspace criado sem ajuda técnica;
- isolamento comprovado entre tenants;
- owner administra equipe, papéis, sessões e integração;
- Inbox/CRM/agenda funcionam com fluxos humanos e IA seguros;
- uma conexão WhatsApp por workspace funcionando no provider aprovado;
- dados exportáveis, exclusão e recuperação documentadas;
- produção monitorada com backup/restore, CI e plano de incidentes;
- páginas e textos públicos dizem com honestidade quais providers são oficiais, quais são não oficiais e quais riscos existem.

## 9. Fontes externas verificadas para a etapa futura

Verificadas em 2026-09-25; revisar novamente quando a fase Baileys começar:

- [Repositório oficial WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) — declara licença MIT para o projeto Baileys, descreve a biblioteca como WebSocket para WhatsApp Web e declara que não é afiliada/autorizada/endossada pelo WhatsApp; o README adverte contra spam e uso em massa/automatizado. Na consulta, a release mais recente exibida era `v7.0.0-rc14`; revisar mudanças de versão antes de fixar uma.
- [FAQ oficial Baileys](https://baileys.wiki/faq) — explica que a conexão usa o protocolo WhatsApp Web via Linked Devices, não a Business API; o suporte Mobile API não é o escopo da biblioteca; recomenda cautela com rate limits.
- [Gerenciamento oficial de sessão Baileys](https://baileys.wiki/authentication/session-management) — desaconselha `useMultiFileAuthState` em produção e orienta um auth store próprio baseado em banco; credenciais e chaves Signal precisam ser guardadas como segredos.
- [Termos de Serviço do WhatsApp](https://www.whatsapp.com/legal/terms-of-service) — revisar a versão vigente na época do lançamento; os termos publicados incluem restrições a usos não autorizados, bulk/auto-messaging e possibilidade de desativação/suspensão.
- [Tags Docker Hub `intrategica/papi-free`](https://hub.docker.com/r/intrategica/papi-free/tags) — a tag `1.5.1` existe, mas a listagem também mostra `1.5.2`; o código-fonte/licença da imagem precisam ser obtidos diretamente com o mantenedor.

Esta seção é planejamento de engenharia, não aconselhamento jurídico. A decisão comercial de oferecer conexão não oficial exige revisão de termos, privacidade e risco para o cliente.
