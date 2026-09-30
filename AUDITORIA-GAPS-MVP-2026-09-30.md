# Forte Panel — Auditoria de gaps do MVP

**Data:** 2026-09-30
**Escopo:** cruzamento da Fonte Única de Verdade, roadmap, handoffs, auditorias de segurança/UX, checklist beta, contratos e evidências recentes de CI/Docker/WhatsApp.
**Conclusão:** o núcleo técnico WhatsApp está comprovado, mas o produto SaaS público ainda não está fechado.

## 1. Correção de interpretação

O projeto atingiu um **MVP técnico interno/controlado**:

- conexão Baileys persistente;
- inbound e outbound reais nos dois sentidos;
- Inbox operacional;
- worker com entrega comprovada;
- outbox com retry, dead-letter e recuperação após restart;
- typecheck, builds, suíte local e CI PostgreSQL verdes.

Isso não equivale ainda a um **MVP SaaS público pronto para convidar clientes ou cobrar**. Os documentos canônicos são explícitos: build verde, teste unitário e Docker local não substituem staging, restore, browser smoke, segurança e operação real.

## 2. Bloqueadores P0 — não abrir beta público ainda

| Prioridade | Gap | Situação | Evidência/critério de fechamento |
|---|---|---|---|
| P0 | Staging PostgreSQL persistente com dois ou mais workspaces | Aberto | Migrations limpas, testes negativos e nenhum acesso cruzado em ambiente persistente |
| P0 | Restore completo | O7.12 corrigiu verificação prévia e alvo de sessão; restore completo ainda aberto | Restaurar banco, blobs/mídia e sessão Baileys em ambiente limpo; validar health, tenancy e pareamento |
| P0 | Browser smoke real desktop/mobile | Aberto | Login, onboarding, conexão, Inbox, envio, estados de erro e acessibilidade em navegador autenticado |
| P0 | Segurança de sessão e secrets | O7.11 iniciado; headers/CSRF/origem/bearer cobertos, secrets e staging pendentes | Chave de auth Baileys obrigatória, rotação, revogação de sessão, ownership de storage, headers e CSRF verificados |
| P0 | Efeito externo idempotente no gateway | Código O7.9 concluído; prova externa pendente | Ledger/single-flight por instância e chave; timeout/restart não pode duplicar envio |
| P0 | Inbound transacional | Código O7.10 concluído; crash/restore persistente ainda pendente | Crash em qualquer etapa resulta em commit completo ou nenhum efeito; retry não duplica mensagem/unread/contato |
| P0 | Quality gate sem skips críticos | Aberto | PostgreSQL, migrations, policy, gateway, E2E, browser e staging precisam ser gates obrigatórios, não apenas testes opcionais |
| P0 | Runbook operacional | O7.12 iniciado com sequência de backup/verify/restore; incidente, RPO/RTO e rollback real ainda abertos | Pareamento, troca de número, logout, reconnect, DLQ, replay, restore, incidente, RPO/RTO e rollback |
| P0 | Revisão legal e de risco Baileys | Aberto | Termos, privacidade, retenção, exclusão, consentimento e aviso de uso de WhatsApp não oficial |

## 3. Gaps de produto — o núcleo de negócio ainda não está completo

### 3.1 Onboarding e acesso

- verificação de e-mail no cadastro público;
- convite de funcionário com fluxo completo de aceite, reenvio e desativação;
- checklist de ativação com estados reais;
- empty/loading/error/retry consistentes em todas as jornadas;
- remoção de `CORE_ONLY_MODE` somente quando as capacidades expostas estiverem realmente prontas.

### 3.2 Operação diária

- Dashboard orientado a ações reais, sem valores demo ou fixos;
- Inbox com estados claros de IA ativa, IA pausada, humano assumiu e conexão degradada;
- paginação/cursor para Inbox e histórico;
- composer completo para tipos interativos ainda não comprovados no canal: localização, contato, reação, resposta e demais payloads avançados;
- UX mobile, foco de dialogs/drawers, contraste, labels e navegação por teclado;
- separação de monólitos de páginas/componentes para manutenção segura.

### 3.3 IA

- fallback explícito entre models/capabilities, nunca silencioso;
- transcrição dedicada quando o endpoint não aceita áudio;
- OCR/document extraction com limite e retenção;
- custo/token por provider e workspace;
- proteção contra prompt injection em mídia/documento;
- validação do fluxo completo no staging.

### 3.4 Comercial e cobrança

- billing SaaS real ainda não implementado;
- checkout, upgrade, downgrade, cancelamento e retenção continuam em modo de código/contrato;
- provider de billing não configurado;
- cadastro público, planos comerciais, termos e suporte ainda não podem ser liberados como produto público.

## 4. Gaps de segurança, dados e confiabilidade

- webhook precisa de proteção anti-replay completa: timestamp, nonce/janela e revogação por instância/workspace;
- logout e troca de senha precisam invalidar sessões/JWT antigos;
- rate limit distribuído, não apenas `Map` local por processo;
- CSP, HSTS, CORS, `frame-ancestors`, Referrer-Policy e Permissions-Policy;
- limites de payload/body e retenção formal de eventos, mídia e logs;
- backup off-host criptografado e restauração periódica automatizada;
- blob de mídia, Redis, sessão Baileys e chave de criptografia precisam estar incluídos no plano de restore; O7.14 definiu interface paginada e delete por etag, mas o provider Forge disponível ainda não oferece list/delete;
- FKs/checks/chaves compostas e reconciliação persistente de órfãos/cross-tenant ainda precisam de prova; O7.13 já classifica candidatos sem apagar prefixos desconhecidos;
- concorrência de agenda, idempotência de fila e leases precisa de testes dedicados;
- correlação estruturada e redaction em logs;
- alertas externos para worker, gateway, DB, fila e storage;
- imagens devem ser promovidas por digest imutável com rollback operacional.

## 5. Gaps de escala e performance

- medir p50/p95/p99, heap/GC, WAL, pool, idade da fila e throughput;
- testar a coorte de até 10 workspaces;
- definir claim/lease atômico e limites por workspace, instância e conversa;
- avaliar fila PostgreSQL com claim robusto ou Redis Streams/BullMQ;
- paginação do Inbox e índices compostos de mensagens, notes e audit logs;
- orçamento explícito de CPU/memória/disco por processo gateway;
- retenção e limpeza de `webhookEvents`, `domainEvents` e objetos órfãos.

## 6. Itens já resolvidos e que não devem voltar para a fila

- inbound/outbound básico real em ambos os sentidos;
- sessão persistente e reconexão após restart sem novo QR;
- histórico Baileys não importável reconhecido com ACK ignorado;
- 4xx permanente em dead-letter, mantendo 408/429/5xx retryáveis;
- métrica de pending/dead-letter no `/ready`;
- recuperação de pending após restart;
- CI PostgreSQL efêmero, testes do Panel/gateway, typechecks e builds;
- smoke Docker local do gateway e preservação de volumes;
- interativos nativos já implementados no gateway para o escopo documentado de botões, listas, enquetes e carousel.

## 7. Ordem recomendada a partir de agora

1. **Não criar nova feature de superfície.** Abrir staging persistente descartável.
2. Executar migrations, isolamento negativo, E2E administrativo e smoke real.
3. Fazer backup e restore limpo de banco, mídia e sessão.
4. Rodar browser smoke desktop/mobile com axe/Lighthouse e corrigir bloqueios reais.
5. Fechar segurança P0: sessão, secrets, webhook anti-replay, storage ownership e headers.
6. Fechar idempotência fim a fim e transação inbound antes de aumentar a coorte.
7. Criar runbook e observabilidade externa.
8. Repetir com dois workspaces; depois com até dez workspaces descartáveis.
9. Só então decidir beta assistido; billing e cadastro público vêm depois da evidência operacional.

## 8. Veredito

| Alvo | Estado |
|---|---|
| Protótipo | Superado |
| MVP técnico interno | Atingido |
| MVP controlado de WhatsApp | Atingido |
| MVP SaaS para beta assistido | Parcial; bloqueado pelos gates P0 |
| Produto público multiempresa | Não atingido |
| Produto pronto para cobrança | Não atingido |

**Decisão:** o próximo trabalho de maior valor não é mais coding genérico. É fechar os gates P0 em staging e, quando uma falha real aparecer, voltar ao código com uma fatia específica e evidência anexada.
