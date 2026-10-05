# 0000 — Invariantes do produto

**Estado:** implementado como regra de arquitectura; a cobertura de cada domínio ainda está a ser catalogada.

## Objectivo

Definir as regras que não podem ser alteradas por uma feature, migration, adapter ou mudança de UX sem uma decisão explícita de produto e uma actualização desta spec.

## Invariantes

### 1. Tenancy e ownership

- Dados, mensagens, media, quotas, métricas e efeitos pertencem a um workspace.
- Uma operação nunca pode ler ou alterar dados de outro workspace por ID, contacto, instância, token ou sessão.
- Guards de autorização e ownership devem existir no servidor; esconder uma opção na UI não é controlo de segurança.

### 2. Canal operacional

- **Baileys é o único canal/provedor operacional do produto.**
- PAPI pode ser usada apenas para revisão de engenharia; não é dependência, provider ou opção de UX.
- Não adicionar providers alternativos, credenciais Meta, webhooks genéricos ou selecção de canal fora do contrato Baileys.

### 3. Agente e efeitos externos

- O modelo produz comandos internos validados; não monta envelopes Baileys directamente.
- Qualquer efeito externo deve passar por autorização, validação, idempotência quando aplicável e registo operacional.
- Falhas de provider seguem fallback explícito; nunca podem causar efeitos silenciosos ou enviar payload arbitrário.

### 4. Segredos e dados sensíveis

- API keys, tokens, cookies, sessões WhatsApp e credenciais são cifrados ou redigidos conforme o contrato do domínio.
- Prompts não são lugar para credenciais.
- Logs, respostas de erro, auditorias e métricas não devem expor segredos nem conteúdo além do necessário.

### 5. Dados reais e demonstrações

- Fixtures pertencem a testes isolados.
- O runtime de produção não cria dados demo nem expõe seed público.
- Não emparelhar WhatsApp, limpar sessões ou enviar mensagens reais sem autorização específica e número de teste dedicado.

### 6. Schema e compatibilidade

- Migrations são aditivas e preservam dados históricos necessários a upgrades.
- Alterações de contrato devem ter testes de migration em base vazia e upgrade a partir da `main` quando forem candidatas a integração.
- O estado de uma feature deve ser indicado como implementado, parcial, planeado, proibido ou fora de escopo.

### 7. Release

- Só `main` pode originar publicação de imagem operacional.
- Nenhuma publicação ou alteração da instalação real ocorre antes dos gates do mesmo workflow.
- Um build verde não é, sozinho, prova de prontidão pública.

## Critérios de aceitação desta spec

- Cada domínio da [`TRACEABILITY.md`](./TRACEABILITY.md) referencia os invariantes aplicáveis.
- Cada nova feature inclui pelo menos um teste negativo para o invariante de segurança ou tenancy relevante.
- Qualquer excepção é documentada nesta spec antes de ser implementada.
