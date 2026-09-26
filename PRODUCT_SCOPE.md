# Forte Panel — escopo do produto público

## Posicionamento

O Forte Panel será um aplicativo SaaS público para prestadores de serviços e lojas que precisam atender clientes, organizar contatos/oportunidades, agendar serviços e acompanhar vendas via WhatsApp. Um cliente não técnico deve cadastrar sua empresa, convidar/criar logins da equipe, conectar um canal autorizado e operar tudo sem editar arquivos ou depender de instalação local.

## Modelo multi-conta

Separar as entidades, mesmo quando a UI usa linguagem simples:

- **Usuário/login:** master ou funcionário, identidade individual com credenciais próprias.
- **Empresa/workspace/tenant:** fronteira dos dados, configurações e permissões de um negócio.
- **Conexão WhatsApp:** número/sessão de um provider vinculado a uma empresa; não é o workspace nem o login.

Na primeira versão comercial: uma conta master cria uma empresa e administra logins individuais de funcionários; alvo inicial de uma conexão WhatsApp por empresa. Permitir mais de uma empresa/conexão por conta poderá ser considerado depois, sem enfraquecer isolamento.

### Papéis

- **Owner/master:** responsável pela empresa; gerencia equipe, papéis, canais, configuração e recuperação dos acessos.
- **Admin:** pode receber tarefas administrativas delegadas; não transfere a propriedade do workspace.
- **Manager:** supervisão operacional conforme permissões.
- **Agent:** atendimento com acesso limitado.
- **Perfil operacional:** atendente, agente de IA ou profissional executor, separado do papel de autorização.

Funcionários terão nome, identificador de login e senha inicial temporária; cada funcionário possui credencial individual. Senhas nunca ficam em texto puro e desativar ou redefinir credenciais invalida as sessões existentes. Login sem e-mail pode ser suportado inicialmente via username, mas cadastro público do master requer verificação de e-mail antes de abertura ampla.

## Segurança e multi-tenancy

A autenticação não basta: toda consulta, mutation, endpoint REST, webhook, worker, storage e evento deve operar no contexto de tenant derivado de uma membership ativa e validada no servidor. `workspaceId` fornecido pelo cliente não concede acesso. IDs previsíveis não podem permitir atravessar empresas.

O tenant é a unidade de isolamento do produto. Uma empresa nunca poderá ver membros, contatos, mensagens, mídias, agenda, configurações, credentials refs, logs ou conexão WhatsApp de outra empresa. Toda ação administrativa e de segurança deve ser auditada.

O sistema deve provar isso com testes PostgreSQL reais envolvendo no mínimo dois tenants e papéis distintos. O bootstrap atual de administrador global e as dependências de workspace demo/global precisam ser aposentados no caminho SaaS sem apagar dados legados.

## Arquitetura de integrações

Easy!Appointments e Clientverse não são a fonte de verdade do produto. O Forte Panel mantém contatos, conversas, mensagens, funil, agenda, serviços, profissionais, tarefas, notas, tags, métricas e auditoria.

WhatsApp deve ser acessado por adapters desacoplados:

1. **PAPI atual:** provider de transição para desenvolvimento/beta, já integrado ao adapter.
2. **Meta WhatsApp Cloud API:** opção oficial que pode ser mantida como alternativa.
3. **PAPI própria baseada em fork ou Baileys:** objetivo futuro, não parte do primeiro marco público.

A hipótese de que `intrategica/papi-free` já usa Baileys foi levantada pelo usuário. A imagem é usada pelos Compose deste projeto na tag `1.5.2`; a tag `1.5.1` também existe. A listagem pública do Docker Hub não informa um código-fonte associado ou licença da imagem. Antes de derivar código, confirmar com o mantenedor a origem, licença e permissões de uso/fork/distribuição. O MIT declarado para o projeto Baileys não concede direitos sobre a PAPI ou sua imagem.

Baileys é uma biblioteca independente sobre WhatsApp Web/Linked Devices, não a API oficial WhatsApp Business. Qualquer implementação será opcional, transparente ao cliente e sujeita a revisão dos termos/políticas e riscos de desconexão, banimento, mudanças de protocolo, privacidade e suporte. Não usar spam, envio indiscriminado ou automação abusiva.

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
| Gateway REST próprio | Fork PAPI autorizado ou serviço próprio Baileys | Futuro condicionado |

## Fluxo principal

```text
página do produto → cadastro de master → criação de empresa
→ onboarding com perfil, serviços, profissionais, agenda e equipe
→ conexão WhatsApp aprovada e isolada por tenant
→ conversa entra no CRM → IA ou funcionário atende
→ operador agenda/cria tarefa/avança funil → eventos e ações ficam auditados
```

A IA pode sugerir uma configuração estruturada de empresa e agente, mas owner revisa e aprova antes de publicar. Não inserir credenciais no prompt. Simulação, versionamento e rollback fazem parte do caminho seguro.

## API e providers

Manter endpoints versionados e webhooks assinados por tenant. A API de negócio deve incluir os endpoints existentes para contatos, mensagens, disponibilidade e agendamentos, todos autenticados, idempotentes e auditados.

A interface REST interna do futuro gateway WhatsApp deve ficar separada da API pública de CRM. O gateway deve usar autenticação service-to-service, scopes por conexão, callbacks assinados, idempotência e armazenamento seguro das sessões. Nenhuma chave PAPI/Baileys é enviada ao frontend.

## Fases e ordem

1. **Tenancy/autenticação real:** owner ↔ empresa, membership, remoção do workspace global/demo, revogação de sessão e testes de isolamento.
2. **Multi-login:** cadastro master e criação de logins de funcionários com papéis, senha temporária e reset/revogação.
3. **Autoatendimento:** onboarding de empresa, checklist, UI sem configuração técnica e perfil IA revisável.
4. **Canal:** uma conexão WhatsApp por tenant no provider aprovado; staging com E2E, idempotência e takeover humano.
5. **Lançamento:** backup/restore, observabilidade, rate limits, privacidade, suporte, beta e operação.
6. **Depois:** avaliar source/license e prototipar fork PAPI ou gateway Baileys; planos/cobrança e múltiplos canais entram após validação de produto.

Detalhamento, testes de aceite e fontes estão em `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`. As tarefas vigentes estão em `todo.md`; recomendações antigas para iniciar pelo ledger/fencing não substituem a nova prioridade de tenancy e login master.
