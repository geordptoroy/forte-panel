# Handoff — Forte Panel

## Contexto do produto

O Forte Panel está sendo transformado de um conjunto de superfícies beta/demo em um SaaS público de operação comercial para negócios atendidos por WhatsApp. A ordem estratégica é: saneamento público, onboarding simples, WhatsApp confiável, lead e Inbox, orçamento, agenda, recebimento, IA supervisionada, Console Admin de produção e, por fim, planos/cobrança/escala.

O repositório é `geordptoroy/forte-panel`, branch `main`, no caminho `/home/ubuntu/forte-panel`. A instrução operacional vigente é avançar fatia por fatia, documentar tudo, publicar no Git e continuar quando o usuário disser “Próximo”. Os testes completos podem ser pulados quando o usuário mantiver essa instrução; os gates de typecheck, build e diff devem continuar sendo executados.

## Último estado conhecido

A P0.5 criou `client/src/release-catalog.ts`, um catálogo tipado com estados `public_ready`, `internal_only`, `simulation_only` e `not_ready`. O `client/src/core-mode.ts` consulta esse catálogo para decidir o que fica exposto durante a contenção. A navegação reduzida de `PanelLayout` usa `CORE_NAV_ROUTES` em vez de duplicar os caminhos.

No modo atual, ficam expostos no núcleo operacional `/whatsapp-connection`, `/inbox` e `/platform-admin/*`. As demais rotas são catalogadas, mas continuam bloqueadas até suas fatias funcionais. Login, cadastro, recuperação, reset e convite continuam públicos no fluxo de autenticação.

A O1.1 adicionou o wizard público de seis passos em `client/src/pages/OnboardingPage.tsx`. A estrutura visual é:

| Passo | Conteúdo | Estado técnico |
|---|---|---|
| 1. Negócio | Nome, segmento e descrição | Usa `onboarding.profile` e autosave |
| 2. Serviços | Oferta, preço, duração e regra de orçamento | Persiste no perfil atual; catálogo detalhado fica para O1.2 |
| 3. Operação | Área, horários e profissionais | Persiste no perfil atual; disponibilidade detalhada fica para O1.2 |
| 4. Atendimento | Tom, FAQ, limites, humano e qualificação | Usa confirmação humana por bloco |
| 5. Revisão | Checklist, áudio/texto, conflitos e confirmações | Mantém consentimento e revisão existentes |
| 6. Ativação | Retenção, publicação e conexão WhatsApp | Conexão fica habilitada somente depois de publicar |

O wizard é uma camada de experiência. Ele não substitui a validação server-side: publicação continua exigindo os blocos obrigatórios confirmados, sem conflitos pendentes e com checklist completo.

## Arquivos alterados nesta fatia

- `client/src/pages/OnboardingPage.tsx`: wizard, separação dos blocos, navegação e etapa de ativação.
- `ROADMAP-EXECUCAO-FORTE-PANEL.md`: O1.1 marcada como concluída e O1.2 definida como próxima.
- `O1.1-ENTREGA-ONBOARDING-WIZARD.md`: decisões, escopo, critérios e pendências.
- `HANDOFF-PROXIMO-CHAT-IA.md`: este handoff.
- `PROJECT_DOCUMENTATION_INDEX.md`: deve apontar para os dois documentos novos no commit final desta fatia.

## Estado funcional atual

O onboarding já possui contratos persistidos e procedures para sessão, autosave, perfil, checklist, consentimento, retenção, áudio, transcrição, proposta estruturada, missing fields, conflitos, confirmação, publicação versionada e rollback. O código atual ainda tem blocos administrativos de métricas e histórico de versões; eles foram agrupados nas etapas de revisão/ativação para não ficarem misturados com o primeiro formulário.

O onboarding continua classificado como `not_ready` no release catalog enquanto não houver prova completa com banco persistente, navegador, microfone, canal WhatsApp e publicação real. Não liberar `/onboarding` no gate apenas porque a UI foi reorganizada.

## Próxima ação recomendada

A próxima fatia é **O1.2 — Serviços, preços, duração e disponibilidade**. O trabalho deve começar auditando os contratos reais de `workspace.services`, `workspace.professionalsDetailed`, agenda e quotes. A meta é separar o texto livre de serviços do perfil de onboarding e conectar o primeiro serviço a uma entidade operacional persistida, com preço/duração/ativo e vínculo ao profissional quando aplicável.

A sequência recomendada para O1.2 é:

1. Ler schema, db helpers, routers e telas existentes de serviços/profissionais/agenda.
2. Confirmar o modelo canônico e evitar criar uma segunda tabela ou outro formato paralelo.
3. Definir a experiência de catálogo: adicionar serviço, preço fixo ou “a partir de”, duração, disponibilidade e responsável.
4. Conectar o onboarding ao catálogo real sem bloquear negócios que ainda não querem cadastrar tudo; permitir “decidir depois” com fallback seguro.
5. Atualizar o prompt para consultar catálogo/agenda, nunca prometer valores ou horários fora das fontes reais.
6. Atualizar documentação, roadmap e este handoff.
7. Executar `pnpm check`, `pnpm build` e `git diff --check`; pular testes completos somente se essa instrução continuar vigente.
8. Commitar e fazer push para `origin/main`.

## Regras de produto que não podem ser quebradas

O cliente final não deve ver termos como provider, webhook, token, prompt técnico ou gateway como requisito de configuração. A IA pode transcrever, estruturar e redigir rascunhos, mas não pode inventar preço, prazo, disponibilidade, política ou promessa. Toda publicação precisa de confirmação humana e versão com rollback.

O Forte Panel registra recebimentos manuais; não deve afirmar que cobrou ou liquidou o cliente. O WhatsApp precisa sempre preservar workspace, instância, JID, externalId, direção e status. Envio outbound deve falhar fechado quando a instância não for explícita. Seeds/demo ficam restritos a ambientes autorizados e não podem contaminar signup ou produção.

O Console Admin é control-plane interno. Ações de suporte devem exigir autorização, motivo e auditoria. O administrador pode ajudar a criar rascunho, simular e revisar, mas não publicar silenciosamente em nome do cliente.

## Gates e bloqueios

O gate técnico da última alteração deve ser executado antes do commit. O gate de produto continua pendente para prova manual com PostgreSQL persistente, microfone e número WhatsApp real. Não apagar dados nem alterar secrets. Não desligar `CORE_ONLY_MODE` antes de fechar o caminho WhatsApp → Inbox → lead.

## Como continuar no próximo chat

Começar dizendo que vai verificar o checkout, ler `ROADMAP-EXECUCAO-FORTE-PANEL.md`, `FORTE-PANEL-FONTE-DE-VERDADE.md`, este handoff e `O1.1-ENTREGA-ONBOARDING-WIZARD.md`, além de inspecionar o código real de serviços/profissionais/agenda. Não confiar apenas na documentação: comparar sempre com `client`, `server`, `drizzle` e `forte-whatsapp`.

Depois executar O1.2 de ponta a ponta, mantendo mudanças atômicas, atualizando o roadmap a cada fatia e publicando o commit. O usuário quer continuidade direta e costuma responder somente “Próximo”.

**Commit da fatia:** `fda674f` — `feat: add public onboarding wizard`
**Branch esperada:** `main` sincronizada com `origin/main`.
