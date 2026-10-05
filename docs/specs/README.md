# Especificações do produto — SDD

## Objectivo

Esta pasta é a fonte de verdade das especificações **Spec-Driven Development** do Forte Panel. As specs descrevem comportamento verificável; não são handoffs nem planos históricos.

## Regra de evolução

Toda alteração de produto deve seguir:

```text
spec → exemplos válidos/inválidos → testes de contrato → implementação → gates → rastreabilidade
```

Uma spec deve distinguir sempre:

- **Implementado:** comportamento demonstrado pelo código e pelos testes;
- **Parcial:** existe implementação, mas faltam contratos, gates ou cobertura;
- **Planeado:** decisão aprovada, ainda não operacional;
- **Proibido:** comportamento que o produto não pode introduzir;
- **Fora de escopo:** tema que não pertence a esta versão.

## Ordem de leitura

1. [`0000-invariantes-do-produto.md`](./0000-invariantes-do-produto.md)
2. [`TRACEABILITY.md`](./TRACEABILITY.md)
3. A spec do domínio alterado
4. [`../STATUS-ATUAL.md`](../STATUS-ATUAL.md)
5. [`../../AGENTS.md`](../../AGENTS.md) para regras operacionais do repositório

## Catálogo inicial de domínios

| ID | Domínio | Estado inicial |
|---|---|---|
| 0001 | [Identidade, workspaces e tenancy](./0001-identidade-workspaces-tenancy.md) | Parcial; spec criada |
| 0002 | [Autenticação, autorização e sessões de suporte](./0002-autenticacao-autorizacao-sessoes-suporte.md) | Parcial; spec criada |
| 0003 | [Auditoria, logs e segurança operacional](./0003-auditoria-logs-seguranca-operacional.md) | Parcial; spec criada |
| 0004 | Inbox, conversas e mensagens | Baseline a levantar |
| 0005 | WhatsApp Baileys e gateway | Baseline a levantar |
| 0006 | Agenda, leads e oportunidades | Baseline a levantar |
| 0007 | Orçamentos, pagamentos e Pix | Baseline a levantar |
| 0008 | Agente e capabilities | Parcial; em evolução |
| 0009 | Prompts e governação | Parcial; em evolução |
| 0010 | Storage, media, quotas e retenção | Baseline a levantar |
| 0011 | Backups e restauro | Parcial; ambiente Windows bloqueia gates Unix |
| 0012 | Billing e entitlements | Baseline a levantar |
| 0013 | Release, readiness e operações | Baseline a levantar |

## Template mínimo

Cada nova spec deve conter:

1. objectivo e não-objectivos;
2. estado (`implementado`, `parcial`, `planeado`, `proibido` ou `fora de escopo`);
3. actores e permissões;
4. modelo/contrato de entrada e saída;
5. invariantes;
6. exemplos válidos e inválidos;
7. efeitos externos e comportamento de falha;
8. critérios de aceitação ligados a testes;
9. migração/compatibilidade;
10. matriz de implementação e lacunas.
