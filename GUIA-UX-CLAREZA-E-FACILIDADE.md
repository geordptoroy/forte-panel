# Forte Panel — Guia de clareza, entendimento e facilidade

**Data:** 2026-09-27  
**Status:** recomendações de produto para o roadmap; priorizadas por impacto em compreensão e abandono.

## Diagnóstico

O produto tem muitas capacidades — CRM, Inbox, IA, agenda, orçamento, recebimento manual, equipe e suporte — mas um cliente leigo não deve precisar entender a arquitetura para começar. A interface precisa responder sempre:

1. **Onde estou?**
2. **O que preciso fazer agora?**
3. **Por que isso importa?**
4. **O que acontece se eu pular?**
5. **Como desfazer ou pedir ajuda?**

A estratégia é esconder complexidade no início, sem esconder controle quando ele for necessário.

## P0 — maior impacto imediato

### 1. Primeiro acesso com um “próximo passo” único

Depois do cadastro, não abrir dezenas de módulos. Mostrar um checklist de progresso:

1. negócio identificado;
2. primeiro serviço configurado;
3. horário definido;
4. primeira regra de atendimento confirmada;
5. simulação aprovada;
6. canal conectado;
7. bot ativado.

Cada item deve ter **Concluir agora**, **Fazer depois** e uma explicação curta. O botão principal da home deve sempre levar ao próximo item incompleto.

### 2. Separar “configurar” de “operar”

O cliente precisa distinguir:

- **Configurar negócio:** serviços, horários, regras e prompt;
- **Atender clientes:** Inbox, contatos e agenda;
- **Acompanhar resultados:** orçamentos, recebimentos manuais e indicadores;
- **Administrar equipe:** convites e permissões.

Não misturar configurações técnicas de IA, secrets e provider com tarefas do empresário.

### 3. Linguagem de negócio, não linguagem técnica

Preferir:

- “Como sua equipe atende?” em vez de “configurar prompt”;
- “Quando chamar uma pessoa?” em vez de “handoff policy”;
- “Valor informado ao cliente” em vez de `quoteCents`;
- “Recebimento registrado pela equipe” em vez de “payment provider”;
- “Canal de WhatsApp” em vez de “instance/provider/webhook”.

Termos técnicos podem aparecer em “detalhes” ou no console de suporte, nunca como requisito do primeiro uso.

### 4. Toda tela deve explicar o efeito da ação

Antes de salvar/publicar, mostrar frases simples:

> “Ao publicar, o bot poderá usar estas regras nas conversas novas.”

> “Registrar recebimento não cobra o cliente. Apenas salva o que sua equipe recebeu por Pix, cartão ou maquininha.”

> “Revogar o convite impede que o link seja usado, mas não desativa membros que já aceitaram.”

### 5. Estados vazios que ensinam

Cada tela vazia deve ter:

- o que é aquela área;
- por que ela é útil;
- exemplo real;
- botão de ação;
- alternativa de pular;
- link para ajuda.

Nunca mostrar apenas “nenhum registro”.

## P1 — reduzir erro e abandono

### 6. Configuração em camadas

Mostrar primeiro o mínimo necessário. Campos avançados entram em “Mais opções” somente se aplicáveis. Perguntas devem ser condicionais ao segmento e às respostas anteriores.

No onboarding assistido:

- 3–5 perguntas por sessão;
- progresso por bloco, não por quantidade total de perguntas;
- salvar automaticamente;
- retomada no mesmo ponto;
- áudio e texto intercambiáveis;
- “não se aplica” e “decidir depois” explícitos;
- prévia curta da regra logo após cada bloco.

### 7. Centro de ajuda contextual

Adicionar um botão “O que é isso?” por campo importante, com:

- explicação em uma frase;
- exemplo preenchido;
- impacto no atendimento;
- recomendação segura;
- opção “falar com suporte”.

Exemplo para recebimento:

> “Use esta área para registrar o que o cliente pagou na sua loja. O Forte Panel não cobra o cliente e não substitui sua maquininha ou Pix.”

### 8. Preview antes de publicar

Toda configuração que altera o bot deve mostrar:

- “o que entendi”;
- regra curta gerada;
- exemplo de resposta;
- possíveis conflitos;
- botão corrigir;
- botão confirmar;
- opção de simular.

O cliente não deve ser obrigado a ler um prompt longo.

### 9. Erros acionáveis

Trocar mensagens genéricas por ação direta:

- “Não foi possível salvar” → “O horário de sexta está conflitante. Revisar horário.”
- “Acesso negado” → “Seu papel não permite faturamento. Peça acesso ao owner.”
- “Convite inválido” → “O link expirou. Solicite um novo convite.”
- “WhatsApp desconectado” → “Reconectar canal” + “Ver instruções”.

### 10. Confirmação destrutiva ou sensível

Pedir confirmação explícita para:

- publicar prompt;
- desativar funcionário;
- revogar convite;
- apagar dados;
- cancelar orçamento;
- alterar política de atendimento;
- exportar dados pessoais.

A confirmação deve dizer o efeito, não apenas “Tem certeza?”.

## P1 — experiência específica por perfil

### Owner/admin

Ver visão completa, checklist da empresa, equipe, regras, operação e indicadores financeiros. Não deve ser obrigado a entender secrets ou infraestrutura.

### Manager

Ver tarefas operacionais, equipe e indicadores necessários. Faturamento sensível e secrets continuam protegidos por padrão.

### Atendente

Entrar diretamente na Inbox/agenda de trabalho. Ver clientes e histórico necessários, com ações de responder, registrar nota e encaminhar. Não apresentar menu de faturamento, prompt, secrets ou exportação.

### Professional

Entrar em “Minha agenda”, próximos atendimentos, dados necessários do cliente e disponibilidade própria. Não mostrar o painel inteiro como se fosse administrador.

## P2 — fluxo financeiro sem confusão

O produto não é gateway de cobrança nesta fase. A tela deve deixar isso visível:

- valor do orçamento;
- status do orçamento;
- valor recebido manualmente;
- meio: Pix, cartão, dinheiro, maquininha, outro;
- data e responsável pelo registro;
- observação/comprovante se houver;
- saldo operacional calculado, sem afirmar que houve liquidação bancária.

Usar rótulos “registrar recebimento” e “valor informado pela equipe”, nunca “pagamento confirmado pelo sistema”.

## P2 — confiança no suporte por IA

Sempre diferenciar visualmente:

- resposta original do empresário;
- transcrição;
- fatos extraídos;
- regra redigida pela IA;
- regra confirmada;
- prompt publicado.

Mostrar confiança e pendências em linguagem humana: “Falta confirmar se atende aos domingos”. O suporte pode ajudar, mas não deve publicar silenciosamente.

## Métricas de facilidade

Medir antes de ampliar o produto:

- taxa de conclusão do primeiro checklist;
- tempo até primeira simulação;
- abandono por etapa;
- quantidade de correções por bloco;
- uso de “decidir depois”;
- tickets por tela/termo;
- erros de convite e aceite;
- tempo até primeira conversa respondida;
- percentual de usuários que encontram o próximo passo sem ajuda.

## Critérios de aceite de UX

- Um empresário leigo consegue dizer o que fazer em seguida sem treinamento.
- Nenhuma tela inicial exige conhecimento de prompt, provider, webhook ou gateway.
- Toda área vazia explica sua finalidade e oferece uma ação.
- O atendente entra na sua área de trabalho sem ver módulos irrelevantes.
- O registro manual de recebimento não é apresentado como cobrança automática.
- O usuário consegue voltar, corrigir, pular e retomar sem perder informação.
- O sistema nunca transforma uma incerteza da IA em regra publicada sem confirmação.
- Mensagens de erro indicam como resolver.
