# Auditoria do Core Operacional — 2026-09-27

## Objetivo

Priorizar o funcionamento real do produto antes de continuar refinando console administrativo, faturamento e detalhes de equipe.

O fluxo crítico do MVP é:

```text
WhatsApp/Baileys
  -> webhook assinado
  -> ingestão idempotente
  -> Inbox/conversa
  -> worker/outbox
  -> agente
  -> resposta enviada
  -> agenda e confirmação
```

## Estado observado no teste local

### Infraestrutura

- Panel health/readiness: aprovado.
- PostgreSQL: saudável.
- Redis: saudável.
- Worker: iniciado.
- Gateway Baileys: saudável e com sessão conectada.
- Outbox do gateway: sem pendências no snapshot observado.

### Bloqueios e problemas registrados

#### P1 — Core ainda não comprovado

Ainda não foi comprovado de ponta a ponta:

1. mensagem real entrando pelo Baileys;
2. webhook chegando ao Panel;
3. evento aparecendo na Inbox;
4. processamento do worker;
5. geração de resposta pelo agente;
6. envio da resposta pelo gateway;
7. consulta/criação de disponibilidade;
8. confirmação de agendamento para o cliente.

Enquanto esse caminho não funcionar, faturamento e acabamento do console ficam secundários.

#### P1 — Autenticação

- E-mail inválido é rejeitado, mas a UI expõe o objeto técnico do Zod (`origin`, `code`, `pattern`, `path`). Deve apresentar apenas uma mensagem amigável.
- A senha `12345678` foi aceita. Deve existir política mínima de senha forte aplicada no frontend e backend.
- Reset para e-mail inexistente responde de forma genérica, o que é desejável contra enumeração.
- E-mail de reset não pode ser validado no ambiente local sem provider configurado; será testado em ambiente com entrega real.
- Recuperação via WhatsApp é uma possível evolução, não deve ser improvisada: precisa de código one-time, expiração, tentativas limitadas e número previamente verificado.

#### P2 — Console da plataforma

- `/platform-admin/workspaces` não troca a interface corretamente na versão em execução.
- Lista de workspaces aparece na Visão geral em vez de uma página própria.
- Indicadores de canal, IA, worker, quotas e uso não aparecem claramente.
- Contagens não estão identificadas.
- Nome de workspace, owner/e-mail, pesquisa e abertura de suporte funcionam parcialmente.
- Sessão read-only, revogação e bloqueio após revogação funcionam.
- Nenhum segredo foi visto exposto.
- Detalhe do workspace precisa de resumo explícito e dados completos.
- Área do agente deve mostrar prompt, estado, limites e herança global; provider/modelo global não deve ser duplicado indevidamente no workspace.

#### P2 — Equipe, profissionais e serviços

- Cadastro de profissional está duplicado entre Equipe e Profissionais.
- Deve existir um fluxo único para profissional, contato, função, e-mail/telefone, disponibilidade, escala, serviços e permissões.
- Falta modelar intervalo/disponibilidade.
- Convite funciona parcialmente, mas a interface está confusa.
- Portal do profissional mostra tarefas, mas não mostra adequadamente os agendamentos.
- Funil de atendimento aparece para perfis que não deveriam acessá-lo.
- Papéis e capacidades precisam de um roadmap claro.

#### P3 — Faturamento

- Executor sem permissão financeira não viu o módulo: comportamento aparentemente correto.
- `canRegisterPayments` aparece no cadastro administrativo.
- Registro de recebimento ainda não foi testado por depender do fluxo de atendimento/mensagens.
- Owner/admin ainda precisam de teste específico.

## Roadmap de implementação

### Fase 1 — Transporte e Inbox

- Testar mensagem de texto real.
- Instrumentar/confirmar webhook, idempotência e workspace resolvido.
- Confirmar criação de contato, conversa e mensagem.
- Confirmar status de processamento e erros visíveis.

### Fase 2 — Outbound manual

- Responder pela Inbox.
- Confirmar criação do job outbound.
- Confirmar worker, retry, status final e entrega no WhatsApp.
- Testar recuperação após restart sem duplicação.

### Fase 3 — Agente automático

- Confirmar seleção do prompt correto.
- Confirmar contexto da conversa.
- Confirmar roteamento para texto/visão/áudio/documento.
- Confirmar resposta automática com segurança e limites.

### Fase 4 — Agenda

- Consultar disponibilidade real.
- Oferecer horários válidos.
- Confirmar horário somente após aceite explícito.
- Criar appointment sem conflito.
- Enviar confirmação e registrar auditoria.

### Fase 5 — Autenticação e permissões

- Sanitizar mensagens Zod.
- Fortalecer senha.
- Completar convite, reset e sessão.
- Consolidar papéis e capabilities.

### Fase 6 — Console, equipe e faturamento

- Corrigir rotas e páginas separadas.
- Completar suporte/auditoria/IA global.
- Unificar profissionais e serviços.
- Completar disponibilidade e agendamentos do profissional.
- Validar faturamento por capability.

## Procedimento de teste do core

Cada rodada deve testar apenas uma transição:

1. **Inbound:** enviar `teste core 001` de outro telefone e verificar Inbox.
2. **Outbound manual:** responder uma única vez pela Inbox e verificar entrega.
3. **Agente:** habilitar somente depois dos dois passos anteriores.
4. **Agenda:** testar com uma intenção de agendamento depois da resposta automática.

Formato do registro:

```text
Data/hora:
Etapa:
Entrada:
Resultado esperado:
Resultado obtido:
Tempo:
URL/tela:
Erro visível:
Logs relevantes:
```

## Regra de trabalho

- Não misturar correção de faturamento com correção do core.
- Não alterar o repositório durante a coleta de evidências, salvo quando a implementação da fase atual for explicitamente iniciada.
- Cada alteração de código deve ser commitada imediatamente.
- Repetir testes somente após fechar a fase correspondente.
