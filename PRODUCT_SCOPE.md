# Forte Panel — escopo do produto público

## Posicionamento

O Forte Panel será um aplicativo SaaS público para prestadores de serviços e lojas que precisam atender clientes, organizar contatos/oportunidades, agendar serviços e acompanhar vendas via WhatsApp. Um cliente não técnico deve cadastrar sua empresa, convidar/criar logins da equipe, conectar um canal autorizado e operar tudo sem editar arquivos ou depender de instalação local.

## Modelo multi-conta

Separar as entidades, mesmo quando a UI usa linguagem simples:

- **Usuário/login:** master ou funcionário, identidade individual com credenciais próprias.
- **Empresa/workspace/tenant:** fronteira dos dados, configurações e permissões de um negócio.
- **Conexão WhatsApp:** sessão Baileys vinculada a uma empresa; não é o workspace nem o login.

Na primeira versão comercial: uma conta master cria uma empresa e administra logins individuais de funcionários; alvo inicial de uma conexão WhatsApp por empresa. Permitir mais de uma empresa/conexão por conta poderá ser considerado depois, sem enfraquecer isolamento.

### Papéis

- **Owner/master:** responsável pela empresa; gerencia equipe, papéis, canais, configuração e recuperação dos acessos.
- **Admin:** pode receber tarefas administrativas delegadas; não transfere a propriedade do workspace.
- **Manager:** supervisão operacional conforme permissões.
- **Agent:** atendimento com acesso limitado.
- **Perfil operacional:** atendente, agente de IA ou profissional executor, separado do papel de autorização.

Além dos papéis de uma empresa, existe um papel de **plataforma** separado: `platform_admin`/suporte interno. Ele administra workspaces do Forte Panel e não deve ser modelado como um admin global capaz de ignorar a membership. O suporte usa sessão escopada, read-only por padrão, expiração, motivo e auditoria.

Funcionários terão nome, identificador de login e senha inicial temporária; cada funcionário possui credencial individual. Senhas nunca ficam em texto puro e desativar ou redefinir credenciais invalida as sessões existentes. O cadastro público inicial do owner/master será por e-mail e senha, criando um workspace em `onboarding`; confirmação de e-mail será adicionada depois, atrás de feature flag desligada até o provedor de envio estar configurado. Google OAuth e outros provedores também ficam para uma fase posterior.

## Segurança e multi-tenancy

A autenticação não basta: toda consulta, mutation, endpoint REST, webhook, worker, storage e evento deve operar no contexto de tenant derivado de uma membership ativa e validada no servidor. `workspaceId` fornecido pelo cliente não concede acesso. IDs previsíveis não podem permitir atravessar empresas.

O tenant é a unidade de isolamento do produto. Uma empresa nunca poderá ver membros, contatos, mensagens, mídias, agenda, configurações, credentials refs, logs ou conexão WhatsApp de outra empresa. Toda ação administrativa e de segurança deve ser auditada.

O sistema deve provar isso com testes PostgreSQL reais envolvendo no mínimo dois tenants e papéis distintos. O bootstrap atual de administrador global e as dependências de workspace demo/global precisam ser aposentados no caminho SaaS sem apagar dados legados.

## Arquitetura de integrações

Easy!Appointments e Clientverse não são a fonte de verdade do produto. O Forte Panel mantém contatos, conversas, mensagens, funil, agenda, serviços, profissionais, tarefas, notas, tags, métricas e auditoria.

O único canal WhatsApp do produto é Baileys, por meio do gateway interno `forte-whatsapp`. A UI não oferece seleção de provider; o Panel resolve a propriedade da instância/workspace e o gateway não decide tenancy. Não adicionar adapters, credenciais ou configuração para outros canais.

Baileys é uma biblioteca independente sobre WhatsApp Web/Linked Devices, não a API oficial WhatsApp Business. A implementação ativa precisa informar os riscos de sessão, desconexão, mudanças de protocolo, políticas do WhatsApp, privacidade e suporte. Não usar spam, envio indiscriminado ou automação abusiva.

### Identidade comercial no CRM

`Contact` representa a identidade operacional da pessoa; `Lead` representa o registro comercial tenant-scoped associado a esse contato; `Opportunity` representa a negociação e mantém o estágio do funil. Na primeira entrega, há no máximo um Lead por `(workspaceId, contactId)` e uma Opportunity por Lead; suportar múltiplas negociações para a mesma pessoa pode ser avaliado em uma fatia posterior. `Conversation` guarda o vínculo direto com a Opportunity ativa. `Opportunity.stage` é a fonte canônica; `contacts.stage` permanece como espelho compatível e é atualizado junto.

Uma mensagem individual aceita e recebida ao vivo pode criar/atualizar Lead e Opportunity. Mensagens próprias (`fromMe`), grupos, histórico/backfill, eventos ignorados ou payloads inválidos não devem ser promovidos como novo lead comercial. A migration aditiva faz backfill de contatos individuais existentes sem mover dados entre workspaces.

### Assignment e próxima ação no Inbox

O dono de uma negociação é uma membership ativa do mesmo workspace, armazenada na Opportunity; somente owner, admin ou manager pode atribuir/reatribuir. Um agente não vê opções de outros workspaces nem memberships inativas. Cada Opportunity mantém no máximo uma próxima ação aberta com texto e prazo futuros; membros ativos com acesso ao Inbox podem criar/reagendar/concluir, e cada mudança é auditada. A UI mostra dono, prazo e atraso. Concluir a próxima ação não envia mensagem, não agenda automação e não muda o estágio automaticamente; o operador decide o próximo passo.

## Módulos de produto

| Módulo | O que resolve | Prioridade |
|---|---|---:|
| Cadastro, login e empresa | Acesso do master, workspace isolado, sessão e setup inicial | P0 — primeiro |
| Equipe e permissões | Funcionários individuais, papéis, reset e desativação | P0 |
| Inbox WhatsApp | Conversas, mídia, estado IA/humano, distribuição e conexão por tenant | P0 |
| CRM de contatos | Perfil, tags, notas, origem, consentimento e histórico | P0 |
| Funil Kanban | Etapas, tarefas e motivos de perda | P0 |
| Agenda própria | Serviços, profissionais, duração, jornada, bloqueios e confirmação | P0 |
| Onboarding guiado | Configurar empresa, equipe, catálogo, agenda e IA sem jargão | P0 |
| Automação | Gatilhos de mensagem, mudança de estágio, agendamento e follow-up | P1 |
| API e webhooks | API por tenant para sites e integrações autorizadas | P1 |
| Relatórios | Conversão, resposta, ocupação, receita e equipe | P1 |
| Planos/limites/cobrança | Limites de empresas, funcionários, conversas, automações e canais | P2, decisão posterior |
| Console interno da plataforma | Contas beta, suporte, saúde, quotas e configuração versionada do agente por workspace | P0 — antes do beta |
| Gateway WhatsApp | Serviço interno Baileys, isolado do CRM e tenant-scoped | P0 — manter como único canal |

## Fluxo principal

```text
página do produto → cadastro de master → criação de empresa
→ onboarding com perfil, serviços, profissionais, agenda e equipe
→ conexão WhatsApp aprovada e isolada por tenant
→ conversa entra no CRM → IA ou funcionário atende
→ operador agenda/cria tarefa/avança funil → eventos e ações ficam auditados
```

A IA pode sugerir uma configuração estruturada de empresa e agente, mas owner revisa e aprova antes de publicar. Não inserir credenciais no prompt. Simulação, versionamento e rollback fazem parte do caminho seguro.

## API e gateway WhatsApp

Manter endpoints versionados e webhooks assinados por tenant. A API de negócio deve incluir os endpoints existentes para contatos, mensagens, disponibilidade e agendamentos, todos autenticados, idempotentes e auditados.

A interface REST interna do gateway WhatsApp fica separada da API de CRM. O gateway usa autenticação service-to-service, scopes por conexão, callbacks assinados, idempotência e armazenamento seguro das sessões. Nenhuma credencial é enviada ao frontend.

## Fases e ordem

1. **Tenancy/autenticação real:** owner ↔ empresa, membership, remoção do workspace global/demo, revogação de sessão e testes de isolamento.
2. **Multi-login:** cadastro master e criação de logins de funcionários com papéis, senha temporária e reset/revogação.
3. **Autoatendimento:** onboarding de empresa, checklist, UI sem configuração técnica e perfil IA revisável.
4. **Canal:** uma conexão Baileys por tenant; staging com E2E, idempotência e takeover humano.
5. **Operação do beta:** console interno de contas/suporte, configuração versionada do agente, backup/restore, observabilidade, rate limits, privacidade e operação.
6. **Lançamento:** cadastro público por e-mail/senha, autosserviço do owner, suporte delegado, planos/cobrança e critérios de produção. Confirmação de e-mail e Google OAuth entram depois, desligados até configuração e testes do provedor.
7. **Depois:** evoluir, proteger e operar o gateway Baileys; não adicionar outros canais ao produto.

O estado e a próxima ação estão em [`docs/STATUS-ATUAL.md`](./docs/STATUS-ATUAL.md); o processo de alterações e release está em [`docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`](./docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md). Planos datados antigos não substituem esses documentos.
Cada transição passa pelo mesmo serviço tenant-scoped e grava estágio anterior/novo, origem e ator em histórico imutável, com audit log e evento de domínio na mesma transação. Repetir a etapa atual é no-op; leituras de Inbox, CRM, Agenda, REST e agente preferem `Opportunity.stage`, usando `contacts.stage` só como fallback legado/espelho.
