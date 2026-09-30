# Handoff — Forte Panel

## Contexto do produto

O Forte Panel está sendo transformado de um conjunto de superfícies beta/demo em um SaaS público de operação comercial para negócios atendidos por WhatsApp. A ordem estratégica é: saneamento público, onboarding simples, WhatsApp confiável, lead e Inbox, orçamento, agenda, recebimento, IA supervisionada, Console Admin de produção e, por fim, planos/cobrança/escala.

O repositório é `geordptoroy/forte-panel`, atualmente na branch `feat/o1.2-operational-service-catalog`, no caminho `/home/ubuntu/forte-panel`. A instrução operacional vigente é avançar fatia por fatia, documentar tudo, validar e publicar em uma branch/PR; preferir PR a commit direto em `main`. O próximo chat deve revalidar checkout, remote, status e disponibilidade do PostgreSQL antes de reutilizar caminhos/estado.

## Último estado conhecido

A P0.5 criou `client/src/release-catalog.ts`, um catálogo tipado com estados `public_ready`, `internal_only`, `simulation_only` e `not_ready`. O `client/src/core-mode.ts` consulta esse catálogo para decidir o que fica exposto durante a contenção. A navegação reduzida de `PanelLayout` usa `CORE_NAV_ROUTES` em vez de duplicar os caminhos.

No modo atual, ficam expostos no núcleo operacional `/whatsapp-connection`, `/inbox` e `/platform-admin/*`. As demais rotas são catalogadas, mas continuam bloqueadas até suas fatias funcionais. Login, cadastro, recuperação, reset e convite continuam públicos no fluxo de autenticação.

A O1.1 adicionou o wizard público de seis passos em `client/src/pages/OnboardingPage.tsx`. A estrutura visual é:

| Passo | Conteúdo | Estado técnico |
|---|---|---|
| 1. Negócio | Nome, segmento e descrição | Usa `onboarding.profile` e autosave |
| 2. Serviços | Oferta, preço, duração e regra de orçamento | O1.2 conecta ao catálogo persistido; preço `fixed`, `starting_at` ou `quote`, vínculo opcional e fallback “decidir depois” |
| 3. Operação | Área, horários e profissionais | O1.2 cadastra profissionais e disponibilidade semanal por profissional; jornada não promete vaga |
| 4. Atendimento | Tom, FAQ, limites, humano e qualificação | Usa confirmação humana por bloco |
| 5. Revisão | Checklist, áudio/texto, conflitos e confirmações | Mantém consentimento e revisão existentes |
| 6. Ativação | Retenção, publicação e conexão WhatsApp | Conexão fica habilitada somente depois de publicar |

O wizard é uma camada de experiência. Ele não substitui a validação server-side: publicação continua exigindo os blocos obrigatórios confirmados, sem conflitos pendentes e com checklist completo.

## Entrega registrada nesta continuação

- `client/src/pages/OnboardingPage.tsx` e `client/src/pages/CatalogPage.tsx`: onboarding e catálogo operacional conectados.
- `drizzle/schema.ts`, `drizzle-pg/0045_service_price_mode.sql` e journal: modos de preço persistidos com defaults compatíveis.
- `server/workspace.ts`, `server/routers.ts`, `server/db.ts`, `server/api.ts` e `server/native-agent.ts`: validação tenant-scoped, contrato REST e ferramenta de agenda com semântica explícita.
- `O1.2-ENTREGA-CATALOGO-OPERACIONAL.md`, `API_CONTRACT.md`, fonte canônica, roadmap, `todo.md` e handoffs: decisões, segurança, testes e limitações registrados.

## Estado funcional atual

O onboarding já possui contratos persistidos e procedures para sessão, autosave, perfil, checklist, consentimento, retenção, áudio, transcrição, proposta estruturada, missing fields, conflitos, confirmação, publicação versionada e rollback. O código atual ainda tem blocos administrativos de métricas e histórico de versões; eles foram agrupados nas etapas de revisão/ativação para não ficarem misturados com o primeiro formulário.

O onboarding continua classificado como `not_ready` no release catalog enquanto não houver prova completa com banco persistente, navegador, microfone, canal WhatsApp e publicação real. O1.2 não libera `/onboarding` no gate.

## Próxima ação recomendada

A próxima fatia é **O1.3 — regras de atendimento e revisão de exemplos**. Ler primeiro `O1.2-ENTREGA-CATALOGO-OPERACIONAL.md`, `ROADMAP-EXECUCAO-FORTE-PANEL.md`, a fonte canônica e o código real. Trabalhar os exemplos/regras dentro dos contratos existentes de revisão e publicação; a IA pode sugerir, mas não confirmar nem publicar blocos. Preserve `draft/missing/conflict`, revisão humana, versionamento e rollback. Não amplie o escopo para O1.4, WhatsApp ou release gate sem instrução/aceite de produto.

Validação da fatia anterior: `pnpm check`, `pnpm build` e `git diff --check` passaram; `pnpm test` passou com 212 testes aprovados e 48 ignorados por dependências condicionais ao PostgreSQL. A migration 0045 ainda não foi aplicada em banco real. A tentativa de `drizzle-kit generate` encontrou colisão preexistente entre snapshots 0041/0043; conferir o documento de entrega e não reescrever snapshots históricos sem necessidade.

## Regras de produto que não podem ser quebradas

O cliente final não deve ver termos como provider, webhook, token, prompt técnico ou gateway como requisito de configuração. A IA pode transcrever, estruturar e redigir rascunhos, mas não pode inventar preço, prazo, disponibilidade, política ou promessa. Toda publicação precisa de confirmação humana e versão com rollback.

O Forte Panel registra recebimentos manuais; não deve afirmar que cobrou ou liquidou o cliente. O WhatsApp precisa sempre preservar workspace, instância, JID, externalId, direção e status. Envio outbound deve falhar fechado quando a instância não for explícita. Seeds/demo ficam restritos a ambientes autorizados e não podem contaminar signup ou produção.

O Console Admin é control-plane interno. Ações de suporte devem exigir autorização, motivo e auditoria. O administrador pode ajudar a criar rascunho, simular e revisar, mas não publicar silenciosamente em nome do cliente.

## Gates e bloqueios

O gate técnico da última alteração deve ser executado antes do commit. O gate de produto continua pendente para prova manual com PostgreSQL persistente, microfone e número WhatsApp real. Não apagar dados nem alterar secrets. Não desligar `CORE_ONLY_MODE` antes de fechar o caminho WhatsApp → Inbox → lead.

## Como continuar no próximo chat

Começar revalidando ambiente, branch, `git status`, remote e serviços disponíveis. Ler `PROJECT_DOCUMENTATION_INDEX.md`, a fonte canônica, o roadmap, este handoff e `O1.2-ENTREGA-CATALOGO-OPERACIONAL.md`; depois comparar a documentação com `client`, `server` e `drizzle`. A próxima fatia é O1.3. Após implementar, executar `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`; registrar testes PostgreSQL como pendentes se não houver banco. Publicar apenas na branch de trabalho e atualizar/criar PR; nunca fazer merge automaticamente.

**Commit da implementação O1.2:** `6bd2442` — `feat: connect onboarding to operational service catalog`.
**Branch de trabalho:** `feat/o1.2-operational-service-catalog`.
