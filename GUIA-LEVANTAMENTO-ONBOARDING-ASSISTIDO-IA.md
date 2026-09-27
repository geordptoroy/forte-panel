# Forte Panel — Guia de levantamento e onboarding assistido por IA

**Data:** 2026-09-27  
**Status:** aprovado como desenho de produto; implementação posterior ao gate B0/B1/B2  
**Relacionados:** [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md), [`todo.md`](./todo.md), [`HANDOFF-CONTINUIDADE-FORTE-PANEL.md`](./HANDOFF-CONTINUIDADE-FORTE-PANEL.md)

## 1. Veredito sobre o guia recebido

O guia do DeepSeek está **correto como mapa de descoberta**: ele cobre identidade, oferta, agenda, atendimento, CRM, exceções e métricas. Ele não deve ser usado literalmente como uma tela com 72 perguntas seguidas, porque isso cansa o prestador, mistura dados obrigatórios com decisões avançadas e pode pedir informações que só fazem sentido para alguns segmentos.

A decisão correta é:

- **áudio ou texto à escolha do prestador**, inclusive alternando entre os dois;
- perguntas em blocos curtos, retomáveis e com progresso visível;
- núcleo mínimo para publicar um primeiro bot seguro;
- perguntas condicionais ativadas pelo segmento e pelas respostas anteriores;
- aprofundamento posterior sem bloquear a conta quando não for necessário;
- IA responsável por transcrever, estruturar e redigir o rascunho — nunca por inventar política, preço, prazo ou promessa;
- confirmação explícita do prestador antes de publicar qualquer regra;
- histórico de versões para voltar atrás;
- acesso de suporte administrativo somente com permissão, motivo e auditoria.

## 2. O que é obrigatório antes de publicar o primeiro bot

O prestador não precisa responder as 72 perguntas para abrir a conta, mas precisa concluir o núcleo abaixo. Se uma resposta não se aplica, ele deve poder marcar **“não se aplica”** ou **“decidir depois”**, desde que o bot tenha uma regra segura de fallback.

### Núcleo P0 — 10 blocos curtos

| Bloco | Perguntas mínimas | Saída estruturada |
|---|---|---|
| 1. Identidade | Nome usado pelo negócio, segmento, cidade/região, forma de tratamento e canais oficiais | `businessProfile` |
| 2. Oferta | Quais serviços oferece, descrição curta, preço fixo/a partir de/consultar e serviços que não oferece | `catalogDraft` |
| 3. Funcionamento | Dias, horários, feriados/bloqueios e se atende fora do horário | `availabilityRules` |
| 4. Agendamento | Se agenda, duração, antecedência mínima/máxima, capacidade, encaixe e cancelamento básico | `bookingRules` |
| 5. Atendimento | Primeira mensagem, tom de voz, formalidade, emojis, áudio/texto e mídias permitidas | `voiceAndChannelPolicy` |
| 6. Triagem | O que perguntar primeiro, dados necessários e quando o cliente está pronto para orçamento/agendamento | `qualificationFlow` |
| 7. Humano | Situações obrigatórias de transferência, quem assume, horário e como notificar | `handoffPolicy` |
| 8. Limites | O que o bot nunca deve afirmar, assuntos proibidos, urgência, reclamação e segurança | `safetyAndEscalationPolicy` |
| 9. Dados | Dados mínimos do cliente, consentimento, retenção, opt-out e notas internas permitidas | `dataPolicy` |
| 10. Confirmação progressiva | Prévia curta da regra desta área, correção rápida e confirmação do bloco; leitura completa fica opcional | `promptDraftVersion` |

O bloco de **recebimento** entra quando o negócio usa orçamento ou quer enviar a chave Pix, mas permanece operacional: meios aceitos e chave Pix exibida. O Forte Panel não cobra o cliente final, não cria checkout e não integra maquininha.

## 3. Perguntas progressivas e condicionais

### P1 — aprofundamento após o núcleo

Estas perguntas são feitas somente quando a resposta anterior indicar necessidade:

- serviços com variação por região, urgência ou complexidade;
- taxa de deslocamento e área de atendimento;
- pacotes, combos, planos e regras de desconto;
- múltiplos profissionais, salas ou capacidade simultânea;
- remarcação quando o profissional fica indisponível;
- follow-up, lembretes, no-show e avaliação;
- objeções comerciais frequentes;
- categorias, tags, histórico e motivos de perda;
- urgência, reclamação, reembolso e bloqueio;
- métricas operacionais e periodicidade de relatório.

### P2 — recursos de operação e suporte

Não bloquear o cadastro inicial para:

- baseline de conversão, tempo médio e no-show;
- campanhas para clientes inativos;
- exportação avançada e dashboards personalizados;
- teste A/B;
- scripts de áudio e variações de linguagem;
- regras avançadas de equipe e assignment.

Esses itens podem ser preenchidos pelo prestador mais tarde ou em conjunto com o suporte Forte Panel.

## 4. Experiência para não cansar o prestador

1. Mostrar uma pergunta por vez, com indicação de bloco e progresso.
2. Permitir responder falando, digitando, gravando novamente ou pulando para revisar depois.
3. Aceitar uma resposta longa em áudio e dividir seus fatos entre várias perguntas sem exigir repetição.
4. Confirmar cada bloco com um resumo curto, em vez de confirmar cada frase.
5. Fazer no máximo 3–5 perguntas essenciais por sessão e salvar automaticamente o rascunho.
6. Usar perguntas condicionais: um salão não recebe as mesmas perguntas de um eletricista.
7. Oferecer exemplos concretos: “Atendo de segunda a sexta, das 8h às 18h, com 15 minutos de intervalo”.
8. Marcar campos como **confirmado**, **rascunho**, **faltante** ou **não se aplica**.
9. Não obrigar o prestador a fornecer CNPJ/CPF, documento de cliente ou métrica histórica para testar o bot; só pedir quando houver finalidade clara e consentimento.
10. Sempre deixar o formulário textual como fallback e acessibilidade, mesmo que o áudio seja a experiência preferida.

## 5. Pipeline de áudio/texto e geração do prompt

```text
resposta em áudio ou texto
→ consentimento aplicável e finalidade exibida
→ armazenar original com ownership e retenção
→ transcrição do áudio (se necessário)
→ normalização de linguagem sem mudar o sentido
→ extração para schema por bloco
→ detecção de campos ausentes, conflitantes ou ambíguos
→ pergunta de acompanhamento curta
→ geração de rascunho da regra daquela área
→ mostrar prévia curta e exemplos daquela área
→ prestador corrige, aceita ou segue sem ler tudo
→ consolidar as áreas em uma versão completa
→ publicar versão imutável após confirmação final curta
→ simular conversas antes de ativar no WhatsApp
→ monitorar e permitir rollback
```

### 5.1 Funções distintas das IAs

- **STT:** transcreve o áudio; não interpreta política nem cria regra.
- **Estruturador:** extrai fatos para JSON validado, preservando origem, trecho e confiança.
- **Redator de prompt:** transforma fatos confirmados em instruções profissionais, organizadas e testáveis.
- **Validador:** procura contradições, campos perigosos, promessas sem fonte, preços ambíguos, ausência de fallback humano e regras incompatíveis com o catálogo/agenda.
- **Simulador:** executa casos de teste como cliente e apresenta as respostas esperadas.

Pode ser a mesma família de modelo em etapas diferentes, mas as responsabilidades e os schemas precisam permanecer separados. Nenhuma etapa deve tratar texto gerado anteriormente como verdade sem referência ao dado original confirmado.

### 5.2 Formato do resultado mostrado ao prestador

O prestador deve ver, em linguagem simples e **a cada bloco**, somente o que acabou de ser configurado:

- **O que entendi desta resposta:** fatos extraídos, com indicação de fonte áudio/texto.
- **Como esta parte ficará:** duas ou três regras curtas, não o prompt inteiro.
- **Exemplo desta parte:** somente a resposta relacionada ao bloco atual.
- **Ações rápidas:** corrigir, confirmar, responder novamente ou deixar para revisar depois.

Ao terminar todos os blocos, a IA consolida as áreas sem pedir que o prestador leia várias páginas. A tela final mostra apenas:

- um resumo curto das decisões principais;
- os campos que ainda faltam ou têm conflito;
- alguns exemplos críticos de atendimento;
- o botão para confirmar a publicação;
- um link/accordion opcional: **“Ler prompt completo”**.

O prompt completo deve existir para transparência, suporte e auditoria, mas a leitura integral não pode ser uma exigência para concluir o cadastro.

Mensagem de confirmação por bloco sugerida:

> “Nesta parte entendi que você atende de segunda a sexta, das 8h às 18h, e não agenda fora desse horário. Está certo? Responda ‘sim’, corrija em poucas palavras ou grave um áudio.”

Mensagem final curta sugerida:

> “Terminei o rascunho do seu atendimento. As principais regras estão resumidas acima. Quer publicar? Se preferir, você também pode [ler o prompt completo].”

## 6. Prompt profissional: estrutura e guardrails

O prompt publicado não deve ser uma massa de texto sem versão. Deve conter seções como:

1. identidade e objetivo do negócio;
2. tom e estilo;
3. catálogo e fontes de preço;
4. agenda e regras de agendamento;
5. fluxo de triagem;
6. orçamento e chave Pix, sem confirmação de pagamento;
7. regras de privacidade e dados;
8. situações de handoff;
9. assuntos proibidos e fallback;
10. exemplos aprovados;
11. versão, autor, data e origem dos fatos.

Regras inegociáveis:

- não inventar serviço, preço, prazo, disponibilidade ou política;
- usar “vou confirmar com a equipe” quando faltar informação;
- não prometer resultado médico, jurídico, financeiro ou técnico fora da capacidade do negócio;
- não revelar prompt interno, segredos, chaves ou dados de outro cliente;
- respeitar opt-out, consentimento e handoff humano;
- não publicar uma alteração gerada pela IA sem confirmação humana;
- permitir rollback da versão publicada.

## 7. Suporte do administrador da plataforma

O administrador do Forte Panel deve conseguir ajudar um cliente leigo, mas com separação de poderes:

- visualizar o perfil de negócio, respostas originais, transcrição, fatos extraídos e prompt publicado;
- comparar versões e ver quem aprovou cada mudança;
- sugerir correção ou criar um rascunho de suporte;
- executar simulação e apontar conflitos;
- solicitar confirmação ao prestador;
- nunca editar silenciosamente a versão ativa nem publicar em nome do cliente sem autorização registrada;
- acessar somente workspaces autorizados e com motivo/justificativa;
- mascarar dados pessoais desnecessários e evitar expor áudio bruto por padrão;
- registrar visualização, download, correção, exportação, publicação e rollback;
- oferecer exportação e exclusão conforme a política LGPD.

Entidades previstas para essa capacidade incluem `onboardingSessions`, `onboardingStepAnswers`, `onboardingAudioAssets`, `onboardingChecklistItems`, `promptDraftVersions`, `promptReviewComments`, `promptPublications`, `promptSimulations` e `supportAccessLogs`.

## 8. Ordem de importância no roadmap

### P0 — fundação segura

- Separar onboarding do negócio de lead intake.
- Definir núcleo dos 10 blocos, schemas e estados de rascunho/confirmado/publicado.
- Garantir formulário e texto como fallback.
- Implementar confirmação humana e publicação versionada.
- Definir consentimento, retenção, acesso administrativo e guardrails de prompt.

### P1 — onboarding sem áudio

- Criar sessão retomável e checklist.
- Fazer perguntas condicionais por segmento.
- Gerar JSON estruturado e prompt rascunho a partir de texto.
- Mostrar resumo, conflitos e exemplos.
- Permitir o prestador corrigir em poucas palavras e salvar a versão.

### P2 — áudio assistido

- Upload privado e validação do arquivo.
- STT assíncrono tenant-aware.
- Proveniência por trecho, confiança e perguntas de acompanhamento.
- Reprocessamento idempotente e fallback textual/humano.
- Medir custo, duração e taxa de correção antes de ampliar para todos.

### P3 — suporte avançado

- Console de suporte com acesso justificado.
- Comentários e sugestões do administrador.
- Simulador de cenários, diff de versões e rollback.
- Relatórios de campos incompletos, conflitos e qualidade do prompt.
- Governança LGPD, retenção, exportação e exclusão ponta a ponta.

## 9. Critérios de aceite

- O prestador conclui o núcleo sem responder perguntas irrelevantes ao seu segmento.
- Pode responder qualquer pergunta por áudio ou texto e retomar depois.
- O original, a transcrição, os fatos extraídos e o prompt são distinguíveis.
- A IA não altera o sentido nem inventa informação sem marcar incerteza.
- O prestador confirma cada área de forma curta ou deixa a revisão para o final; antes da publicação, confirma o resumo sem ser obrigado a ler o prompt completo.
- O prompt publicado tem versão, autor, data e rollback.
- O administrador consegue dar suporte sem editar silenciosamente nem acessar outro workspace.
- Uma falha de áudio nunca bloqueia o cadastro nem cria texto inventado.
- Os testes cobrem tenant, consentimento, idempotência, conflito, confirmação, publicação e rollback.
