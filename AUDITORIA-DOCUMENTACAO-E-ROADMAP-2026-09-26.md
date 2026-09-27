# Forte Panel — auditoria documental e roadmap canônico

**Data:** 2026-09-26  
**Repositório:** `geordptoroy/forte-panel`  
**Base da auditoria:** branch `main`, commit `4c5c483`

## 1. Resumo executivo

O Forte Panel já possui uma base forte de CRM multiempresa, Inbox, agenda, worker, quotas, auditoria, agente nativo e gateway Baileys. O maior problema atual não é ausência de código, e sim **desalinhamento entre documentação, contrato de API e implementação recente**.

A partir deste documento, o roadmap canônico passa a ser organizado por produto e capacidade entregue, não por histórico de commits.

### Estado real resumido

| Área                              | Estado real                      | Leitura operacional                                                                                          |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Shell visual e páginas principais | Parcialmente pronto              | Existe bastante cobertura, mas há monólitos, estados inconsistentes e acabamento pendente                    |
| CRM/Inbox/Agenda                  | Funcional em beta técnico        | Precisa de E2E real, observabilidade e refinamento de operação diária                                        |
| Tenancy                           | Avançado, não encerrado          | Muitos domínios usam `workspaceId`; ainda falta provar todos os limites em staging/produção                  |
| Baileys nativo                    | Funcional como gateway próprio   | Texto, mídia recebida, envio genérico e eventos de chamada foram adicionados; produção ainda exige hardening |
| IA multimodelo                    | Funcional em configuração básica | URL, chave e modelo por operação; falta versionamento completo, simulação real e fallback explícito          |
| Console da plataforma             | Código e documentação existem    | Os documentos antigos ainda dizem que ele não existe; precisam ser corrigidos                                |
| Cadastro público                  | Não implementado                 | Continua bloqueado até concluir segurança, suporte e operação                                                |
| Cobrança                          | Não implementada como gateway    | A tela de faturamento é controle operacional, não cobrança SaaS                                              |
| Documentação                      | Inconsistente                    | Há documentos que ainda descrevem PAPI como caminho ativo e Baileys como futuro                              |

## 2. Documentações que estavam desatualizadas

### 2.1 Contradições que devem ser corrigidas

1. `todo.md` ainda afirma que a direção é não começar pelo Baileys e que PAPI é o provider operacional principal. Isso contradiz o código atual e o commit `4c5c483`.
2. `FORTE-MEDIA-HANDOFF.md` aponta commits e próximos testes anteriores à migração atual.
3. `MIGRACAO-PAPI-BAILEYS.md` descreve apenas texto como MVP, mas o gateway atual já baixa mídia, entrega conteúdo multimodal, aceita payload genérico e registra eventos de chamada.
4. `API_CONTRACT.md` ainda apresenta PAPI como contrato principal e descreve Baileys como “em implementação”.
5. `CONFIGURACAO-MULTIMODEL-AGENTE.md` ainda apresenta NVIDIA, Gemini e OpenAI como provedores visíveis e modelos recomendados fixos, enquanto a interface atual trabalha por API de função com URL, chave e modelo livres.
6. `STATUS-COMPLETO-E-PLANO-BETA.md` e `todo.md` dizem que o console interno da plataforma não está implementado, mas há `PlatformAdminPage`, rotas, migration e documento próprio. É necessário separar “código presente” de “validado em PostgreSQL/staging”.
7. Documentos históricos continuam úteis como registro, mas não devem ser usados como instrução operacional sem o selo de “histórico”.

### 2.2 Implementações ainda incompletas ou que exigem hardening

- **Storage de mídia:** o primeiro fluxo transporta mídia como data URL no webhook. Funciona para o MVP, mas não é a arquitetura final para arquivos grandes. Deve migrar para storage privado com URL assinada e expiração.
- **Sessão Baileys:** o gateway usa `useMultiFileAuthState`; precisa de store durável, criptografado, com lock por instância e backup/restauração testados antes de escala.
- **Multi-instância:** o gateway atual está estruturado ao redor de uma instância configurada por processo. O produto precisa de lifecycle de instâncias por workspace, QR escopado, reconexão e limites.
- **Interface de mensagens:** o Inbox agora oferece composer básico para imagem, áudio, vídeo e documento; botões, listas, enquetes, localização, contatos, reações e respostas interativas continuam pendentes.
- **Calls:** eventos de chamada recebida são registrados. Iniciar chamada não é uma mensagem normal do Baileys e requer um fluxo de signaling próprio; não deve ser documentado como envio já entregue.
- **Carrossel:** o Baileys expõe conteúdos específicos como álbum e mensagens interativas; “carrossel” precisa de contrato de produto explícito por versão, não apenas de um nome genérico na UI.
- **Meta Cloud API:** permanece alternativa oficial, mas não possui paridade com todos os tipos Baileys. A interface deve mostrar disponibilidade por canal, não prometer paridade universal.
- **IA:** falta versionamento completo de configuração por workspace, publicação/rollback integrado ao painel de cliente e simulação real sem envio externo.
- **API pública:** o binding por `FORTE_API_WORKSPACE_ID` ainda é controlado por deployment, não uma API pública multiempresa completa.
- **Beta operacional:** faltam staging real, testes de Docker limpo, E2E de WhatsApp com número de teste, alertas externos, backup/restauração e runbook de incidentes.
- **Produto comercial:** cadastro público, verificação de e-mail, convite de funcionários, billing, termos, privacidade e retenção final ainda não estão fechados.

## 3. O que não deve ser refeito agora

- Não reescrever o CRM inteiro.
- Não duplicar adapters WhatsApp para cada tipo de mensagem.
- Não colocar API keys no `.env` do cliente.
- Não copiar ou modificar código/imagem da PAPI sem fonte, licença e autorização.
- Não chamar modelo externo na simulação do console sem deixar isso explícito e auditável.
- Não abrir cadastro público antes de tenancy, sessão, suporte e restauração estarem provados.

## 4. Roadmap canônico

### Fase 0 — Fonte de verdade e higiene do repositório

**Objetivo:** parar a divergência entre o que o código faz e o que a documentação promete.

- [x] Definir este arquivo como auditoria datada.
- [ ] Atualizar `todo.md` para o estado Baileys atual.
- [ ] Atualizar `API_CONTRACT.md` para Baileys nativo como caminho local principal.
- [ ] Atualizar `CONFIGURACAO-MULTIMODEL-AGENTE.md` para APIs por função.
- [ ] Atualizar handoff com commit, validações e limitações reais.
- [ ] Marcar documentos antigos como históricos ou arquivá-los.
- [ ] Criar uma matriz `capacidade → código → teste → ambiente validado`.

**Saída:** documentação sem instruções conflitantes.

### Fase 1 — Fundação de produto e tenancy

**Objetivo:** garantir que cada empresa seja uma fronteira real.

- [x] Membership ativa e contexto de workspace em grande parte do backend.
- [x] Isolamento de CRM, Inbox, agenda, quotas e eventos em vários domínios.
- [ ] Executar toda a suíte contra PostgreSQL persistente de staging.
- [ ] Cobrir storage, sessões, webhooks, jobs e logs com workspace explícito.
- [ ] Remover dependências históricas do workspace demo do caminho público.
- [ ] Fechar revogação de sessão após troca de senha/desativação.
- [ ] Criar exportação e encerramento seguro de workspace.

**Gate:** dois workspaces sintéticos não podem ler, mutar, enviar ou consultar dados um do outro.

### Fase 2 — Identidade, onboarding e permissões

**Objetivo:** transformar a instalação técnica em produto utilizável.

- [ ] Cadastro de empresa/master com verificação de e-mail.
- [ ] Convite de funcionário, senha temporária, reset e desativação.
- [ ] Matriz de permissões por função com testes negativos.
- [ ] Onboarding guiado: empresa, serviços, profissionais, horários e canal.
- [ ] Checklist de ativação com estados reais, não números vazios.
- [ ] Tratamento consistente de loading, erro, retry e empty state.

**Gate:** um owner consegue criar empresa e equipe sem editar Compose ou secret.

### Fase 3 — WhatsApp Baileys como produto de canal

**Objetivo:** fechar o canal local próprio sem esconder limitações.

- [x] Gateway isolado em serviço próprio.
- [x] QR, readiness, reconexão básica e sessão persistente em volume.
- [x] Texto, imagem, áudio, vídeo e documento recebidos com metadata.
- [x] Conteúdo multimodal entregue à operação de IA correspondente.
- [x] Envio genérico de `AnyMessageContent` para tipos avançados.
- [x] Eventos de chamadas recebidas encaminhados ao Panel.
- [ ] Storage privado de mídia com URL assinada.
- [ ] Store de autenticação durável/criptografado e lock de instância.
- [ ] Lifecycle multi-instância por workspace.
- [x] Inbox com anexos, preview e envio de imagem, áudio, vídeo e documento.
- [ ] Inbox com botões, listas, enquetes, localização, contato, reação e respostas interativas.
- [ ] Contrato explícito de álbum/carrossel por versão do Baileys.
- [ ] Testes E2E em Docker com número de teste.
- [ ] Métricas de conexão, envio, download de mídia, retry e desconexão.
- [ ] Runbook de pareamento, troca de número, logout, restore e incidente.

**Gate:** uma imagem, um áudio, um documento, um botão e uma resposta interativa percorrem WhatsApp → gateway → banco → Inbox/agente → gateway, com evidência no banco e no telefone.

### Fase 4 — IA operacional e multimodelo

**Objetivo:** separar configuração, execução e publicação.

- [x] Prompt separado da empresa e das APIs.
- [x] URL, API key e modelo por operação.
- [x] Seleção de operação por tipo de mídia.
- [x] Estado visual real por operação, teste de conexão e erro acionável.
- [ ] Rascunho, revisão, simulação sem envio e publicação versionada.
- [ ] Histórico e rollback por workspace.
- [ ] Fallback opcional configurável, nunca silencioso.
- [ ] Transcrição dedicada para áudio quando o endpoint não aceitar áudio.
- [ ] OCR/document extraction com limite de tamanho e retenção.
- [ ] Controle de custo por operação, modelo e workspace.
- [ ] Proteção contra prompt injection vindo de mídia/documento.

**Gate:** cada operação pode ser testada isoladamente e um erro de imagem não quebra texto nem gera resposta inventada.

### Fase 5 — Interface de operação diária

**Objetivo:** deixar o painel rápido, claro e agradável para uso contínuo.

- [x] Shell responsivo e navegação por áreas.
- [ ] Dashboard orientado a ações: “o que precisa ser feito agora”.
- [ ] Inbox com estados `IA ativa`, `IA pausada`, `Humano assumiu` e conexão degradada.
- [x] Composer com anexos básicos e tipos Baileys de mídia suportados pelo canal.
- [ ] Composer para tipos interativos e payloads avançados.
- [ ] Timeline sem expor raciocínio privado do modelo.
- [ ] Canais em duas camadas: simples por padrão, detalhes avançados sob demanda.
- [ ] Separar `PanelPages.tsx` por domínio.
- [ ] Componentes reutilizáveis para status, erro, empty state, modal e formulário.
- [ ] Acessibilidade: foco visível, labels, contraste e teclado.
- [ ] Verificação visual desktop/mobile em rotas críticas.

### Fase 6 — Console interno e operação do beta

**Objetivo:** permitir suporte sem quebrar isolamento.

- [x] Estrutura inicial do console e migration/documentação existem.
- [ ] Confirmar migration 0019 em PostgreSQL real.
- [ ] Confirmar `platformAdmins` sem fallback pelo papel global.
- [ ] Sessão de suporte read-only escopada com expiração.
- [ ] Ações mutáveis com motivo, diff sanitizado e auditoria.
- [ ] Saúde de workspace, canal, IA, worker, quotas e fila.
- [ ] Notas internas, incidentes e histórico de suporte.
- [ ] Playbooks para desconexão Baileys, quota, erro de IA, duplicidade e restore.

**Gate:** suporte consegue investigar uma conta sem conhecer senha ou ver secret bruto.

### Fase 7 — Confiabilidade e segurança de lançamento

- [ ] CI com PostgreSQL real e migrations limpas.
- [ ] Testes de concorrência de agenda, idempotência, fila e leases.
- [ ] Backup off-host e restauração ensaiada.
- [ ] Logs estruturados com correlation ID e redaction.
- [ ] Alertas externos de worker, DB, gateway e fila.
- [ ] Limites antiabuso e retenção formal de mídia.
- [ ] Revisão de privacidade, termos e uso do WhatsApp não oficial.
- [ ] Processo de rotação de secrets e chaves.
- [ ] Teste de restore da sessão Baileys sem perder pareamento.

### Fase 8 — Beta controlado e lançamento público

- [ ] Convites limitados e onboarding acompanhado.
- [ ] Números de teste separados dos números comerciais.
- [ ] Medir ativação, primeira resposta, falha de conexão, custo de IA e retenção.
- [ ] Corrigir gargalos observados antes de billing.
- [ ] Billing SaaS somente depois de validar custo e proposta.
- [ ] Cadastro público, planos, termos e suporte.
- [ ] Migração gradual por workspace e rollback operacional.

## 5. Ordem prática de execução agora

1. Corrigir documentação conflitante.
2. Finalizar redesign da interface de configuração e estados.
3. Validar Baileys em Docker real com mídia e payloads avançados.
4. Implementar storage privado de mídia.
5. Fechar tipos interativos do Inbox/composer multimídia e substituir data URL por storage privado.
6. Aplicar migrations e testes de tenancy em staging.
7. Fechar versionamento/simulação do agente.
8. Operar beta fechado pelo console interno.
9. Só então abrir cadastro público e discutir cobrança.

## 6. Definition of Done do beta fechado

O beta só deve ser considerado pronto quando:

- uma empresa pode ser criada sem configuração manual de banco;
- dois workspaces passam a suíte de isolamento em PostgreSQL real;
- o owner consegue conectar um WhatsApp por QR;
- texto, imagem, áudio e documento são recebidos, vistos no Inbox e processados corretamente;
- o humano consegue assumir e devolver a conversa para a IA;
- o agente tem prompt/configuração versionados e simulação sem envio real;
- o worker e o gateway têm readiness, heartbeat, logs e alertas;
- backup e restore são comprovados;
- suporte consegue diagnosticar e suspender uma conta com auditoria;
- nenhuma tela promete uma capacidade que o canal selecionado não suporta.
