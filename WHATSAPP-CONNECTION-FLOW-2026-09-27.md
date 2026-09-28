# Core do Forte Panel — instâncias Baileys

**Documento canônico desta etapa · 27/09/2026**
**Estado:** O usuário confirmou o pareamento real no celular; a revisão atual refatora a tela de instâncias e atualiza o reconhecimento do estado, além de separar consumo em `/plans-usage`. Nesta worktree, 158 testes do monorepo passaram (41 dependentes de banco skipped sem `DATABASE_URL`), incluindo 33 do gateway; typecheck e builds de frontend/backend passaram. Esta revisão ainda aguarda CI e publicação GHCR. **A sessão WhatsApp já conectada deve ser preservada**: para testar a atualização visual, usar `pull`/`up` sem reset; o teste com volume limpo continua disponível apenas quando o usuário realmente quiser apagar dados.
**Fonte de verdade para esta fatia:** este documento, `todo.md` e `PROJECT_DOCUMENTATION_INDEX.md`.

---

## 1. Direção do produto registrada

O desenvolvimento passa a avançar **uma página/função principal por vez**. O primeiro core depois do login é **Instâncias WhatsApp**, com somente a gestão e conexão de sessões:

1. criar uma instância Baileys;
2. editar o nome da instância;
3. conectar, parear, desconectar e encerrar uma sessão;
4. excluir uma instância, com confirmação e sem apagar o histórico de mensagens do workspace;
5. consultar plano e consumo do workspace na página separada **Planos e consumo**.

Enquanto essa etapa estiver em revisão, a aplicação mantém as outras páginas e o backend no repositório, mas as rotas não-core ficam temporariamente redirecionadas para Instâncias WhatsApp; **Planos e consumo** é a segunda rota liberada. Isso é um congelamento de produto reversível, **não substitui autorização no servidor**.

### Sequência solicitada para as próximas fatias

| Ordem | Core | Estado |
|---:|---|---|
| 1 | CRUD e conexão de instâncias Baileys; página própria para plano e consumo | CRUD/conexão implementados; esta revisão da interface aguarda CI e teste visual no Docker sem reset |
| 2 | Console administrativo de providers/modelos, URLs, credenciais e roteamento por capacidade | Planejado; ainda não começar antes da revisão da etapa 1 |
| 3 | Enviar e receber mensagens pelos tipos necessários, com roteamento por instância e tratamento correto de mídia | Próximo depois da etapa 2; precisa de testes end-to-end com número de teste |
| 4 | Resposta automática do agente WhatsApp, inicialmente com prompt fictício claramente marcado e modo de simulação antes do envio real | Depois de transporte/mídia aprovados |

A ordem pode ser corrigida pelo usuário depois de revisar este documento. Não habilitar resposta automática nem envio externo apenas porque a conexão Baileys ficou pronta.

---

## 2. Resultado da auditoria documental e decisões de escopo

- O projeto foi concebido por um período para conectar workflows externos, mas **não foi encontrado n8n ativo nem consumidor n8n no código**.
- O contrato REST empresarial existe para compatibilidade/testes de staging, mas fica **desativado por padrão** (`FORTE_PUBLIC_API_ENABLED=false`). Permanecem probes de saúde e o callback interno autenticado/assinado do Baileys. Não é uma API pública para clientes/workflows.
- O gateway Baileys é a integração WhatsApp ativa nesta fase. O código de Meta e integrações antigas continua isolado como compatibilidade; não deve aparecer na experiência do primeiro core nem ser configurado por padrão.
- Não apagar tabelas, sessões, volumes Docker ou históricos como parte de uma limpeza documental. A exclusão de uma instância é uma operação funcional específica, com aviso e confirmação na UI.
- `docs/BAILEYS-INTEGRATION.md` e `forte-whatsapp/README.md` continuam referências técnicas de operação. Este documento substitui a antiga descrição singleton do fluxo do primeiro acesso.
- O inventário dos documentos de auditoria não indicou outros arquivos com conteúdo comprovadamente descartável sem perder decisões, evidências de segurança ou histórico. A consolidação não é autorização para apagar documentos especialistas que serão usados nas fases de IA/admin.

### Ambiente permanente de desenvolvimento

O usuário desenvolve e executa a aplicação localmente em **Docker dentro do WSL**, operando pelo **Windows Terminal/PowerShell**. A implantação em **Oracle Cloud Infrastructure (OCI)** é futura e não faz parte desta fatia. O sandbox deste agente não compartilha o Docker/volumes do usuário; portanto, não declarar teste local Docker realizado quando não foi possível acessá-lo.

As fatias concluídas devem ser registradas no repositório com commit e push na branch de trabalho/PR. Não fazer merge em `main`, reset destrutivo ou limpeza de volumes sem pedido específico.

---

## 3. Arquitetura do CRUD de instâncias

### Registro de negócio

A tabela PostgreSQL existente `whatsappInstances` é reutilizada; não foi criado um segundo cadastro paralelo. Cada registro Baileys contém `workspaceId`, `channelId`, `instanceId`, `name`, `active`, `isDefault` e estado operacional. As migrations adicionadas são:

- `drizzle-pg/0038_baileys_global_instance_ids.sql`: impede colisão global de IDs Baileys, necessária porque o gateway mantém várias sessões no mesmo processo;
- `drizzle-pg/0039_baileys_workspace_default_unique.sql`: garante no máximo uma instância Baileys ativa marcada como padrão por workspace.

Novos IDs são estáveis e gerados no backend. O navegador não escolhe caminho de diretório, chave de gateway, chave de webhook nem workspace de destino.

### Gateway e sessão física

`forte-whatsapp` mantém um `InstanceRegistry` com um `InstanceManager` por `instanceId`. As sessões ficam em diretórios separados abaixo de `WHATSAPP_SESSION_DIR`; o registry persiste `.instance.json` com nome e política de autostart junto dos arquivos da sessão.

- Criar: cria o registro físico inativo e o registro de negócio; a conexão só começa quando o usuário aciona **Conectar e gerar QR**.
- Editar: renomeia o registro no Panel e os metadados do gateway, mantendo o mesmo ID e a mesma sessão autenticada.
- Desconectar temporariamente: encerra o socket e preserva credenciais/sessão; não inicia automaticamente após restart quando o usuário optou por desconectar.
- Encerrar sessão: faz logout do WhatsApp e exige novo pareamento.
- Excluir: a UI mostra confirmação; o gateway tenta encerrar a sessão e remove o diretório físico; o cadastro de negócio fica arquivado/inativo e o histórico do CRM não é apagado. Eventos atrasados de uma instância arquivada são negados.
- Restart do serviço: instâncias novas conectadas retomam de acordo com metadado `autoStart`; sessões antigas sem metadado são descobertas como legadas e podem retomar. Uma instância `default` removida não é recriada automaticamente.

A sessão continua protegida pelos locks de diretório e pela criptografia de credenciais configurada no serviço. A chave de criptografia e os secrets de gateway/webhook pertencem ao ambiente de serviço; **não são chaves por cliente e não são enviados ao navegador**.

### Compatibilidade com uma instalação antiga

Quando `FORTE_API_WORKSPACE_ID` identifica o workspace e o ID legado (`BAILEYS_INSTANCE_ID`, normalmente `default`) realmente existe no gateway, a primeira listagem pode criar um vínculo Baileys idempotente para essa sessão no workspace correto. Sem sessão física existente, o sistema não inventa nem recria a instância default. Instâncias novas são criadas pelo CRUD.

### Isolamento de workspace

As procedures tRPC usam o workspace autenticado e permissão de gerente/owner/admin para mutações. Antes de uma ação de status/QR/conexão/rename/delete, o backend confirma que o ID pertence ao workspace ativo. O callback Baileys resolve `instanceId` no cadastro global: sessão ativa entrega ao workspace proprietário; sessão arquivada/inativa falha; só a instância legacy não registrada pode usar o vínculo explícito de deployment. Envio outbound Baileys sem `instanceId` falha fechado em vez de cair numa sessão global padrão.

---

## 4. O que está na interface

- Flag central: `client/src/core-mode.ts`, `CORE_ONLY_MODE = true`, rota principal `/whatsapp-connection`.
- `App.tsx` encaminha rotas fora do Core para `/whatsapp-connection`; as duas rotas liberadas são WhatsApp e `/plans-usage`. Login, recuperação e aceite de convite continuam disponíveis.
- `PanelLayout.tsx` mostra **Instâncias WhatsApp** e **Planos e consumo** no menu responsivo; não consulta dados da Inbox em segundo plano neste modo.
- **Instâncias WhatsApp** contém apenas criação, renomeação, status, QR, pareamento por telefone, controles de sessão e exclusão confirmada. O consumo não aparece nessa tela.
- **Planos e consumo** é a página própria para o plano atual, cotas, uso e janela de renovação do workspace.
- Demais páginas e módulos não foram deletados: permanecem no código e backend para que possam ser reabertos em uma etapa revisada. A flag não é barreira de segurança.

### Reconhecimento automático da conexão

- O log do teste em 28/09 mostra: `pairing configured successfully` → fechamento `515` (`restart required`) → nova conexão/logging in → `opened connection to WA` e `Baileys session is open`. Esse `515` após a aceitação é o reinício esperado do protocolo, não uma rejeição; o gateway recebeu o pareamento e abriu a sessão.
- O endpoint `workspace.baileysStatus` consulta o snapshot atual do gateway. A tela já tinha polling de 4 s, mas TanStack Query não executa intervalos em segundo plano por padrão; ao alternar para o WhatsApp no celular, a aba podia pausar esse polling. A tela agora consulta em segundo plano (2 s em estados transitórios e 15 s em estado estável) e força revalidação ao voltar o foco ou reconectar a rede. Durante o `515` esperado após aceitação, o gateway expõe `connecting`, não `disconnected`, para conservar o polling rápido ao longo do restart.
- A interface apresenta o estado individual da instância e o resumo de conexões. O check de regressão confirma a política de intervalo; o reteste visual/real continua sendo feito no Docker local.

### Pareamento por número

- A alternativa ao QR usa um seletor de países/regiões com bandeira, nome em português e DDI; o número digitado inclui DDD/código de área, sem repetir o DDI selecionado. A UI valida possibilidade de comprimento e envia o destino em formato internacional.
- Fluxo interno exato: UI chama `workspace.requestBaileysPairingCode` → backend chama `POST /api/instances/{instanceId}/pairing-code` com `phone` em formato internacional → `InstanceRegistry.requestPairingCode` → `InstanceManager.requestPairingCode` aguarda o primeiro evento `qr` (o gateway Baileys emite após `pair-device`) → chama `socket.requestPairingCode(dígitos E.164)`. O método do socket fala com o protocolo WhatsApp; o Panel não deve reproduzir nem chamar endpoints privados do WhatsApp diretamente.
- A identidade do socket para esta operação deve ser canônica: `Browsers.ubuntu("Chrome")`, que produz o display `Chrome (Ubuntu)`. **Não** usar a marca do produto como browser. A configuração antiga `Browsers.ubuntu("Forte Panel")` produzia `Forte Panel (Ubuntu)`, compatível com o caso de códigos mortos descrito pelo issue Baileys [#2560](https://github.com/WhiskeySockets/Baileys/issues/2560): o WhatsApp pode rejeitar `companion_hello` com `400 bad-request` embora o rc14 já tenha retornado um código.
- Limite importante: `baileys@7.0.0-rc14` por padrão envia esse IQ com `sendNode()` e retorna sem aguardar a resposta. O gateway mantém a versão publicada e aplica um backport versionado de `query()` por `patch-package` em `forte-whatsapp/patches/baileys+7.0.0-rc14.patch`; o erro IQ/timeout agora impede a UI de receber um código morto e credenciais transitórias só são persistidas após resposta positiva. O PR upstream [#2559](https://github.com/WhiskeySockets/Baileys/pull/2559) propõe o mesmo endurecimento e outras mudanças, mas a API do GitHub consultada em 28/09/2026 ainda indicava o PR aberto e o npm latest permanecia rc14. Não trocar por branch não lançada; remover o backport só quando uma release oficial contiver o fix e os testes forem atualizados.
- O código nativo é uma string de 8 caracteres e pode conter letras e números; a UI deve exibi-lo sem alterar, truncar ou converter. No aparelho, abrir **Configurações → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone** e digitar exatamente os caracteres exibidos.
- Nova tentativa deve fechar localmente a sessão de pairing ainda não aceita, limpar apenas credenciais transitórias e **não** chamar `socket.logout()` remoto. Após `isNewLogin`/`pair-success`, preservar `account`/`signalIdentities` mesmo que `registered` ainda não esteja true, serializar `creds.update` e só então executar o restart 515 esperado.
- A janela para o evento de prontidão é 30 s, o IQ de confirmação tem limite de 20 s e o proxy dispõe de 55 s no total. Logs incluem eventos de pedido/aceite/open, mas mascaram material de pairing, ephemeral keys, telefone e XML cru. O retorno do código confirma que o servidor aceitou o pedido `companion_hello`, mas o estado permanece “aguardando pareamento”; só `isNewLogin` seguido de `connection: open` confirma sessão estabelecida.

### Procedures tRPC principais

- consultas: `workspace.baileysInstances`, `workspace.baileysStatus`, `workspace.baileysQr`;
- mutações: `workspace.createBaileysInstance`, `workspace.renameBaileysInstance`, `workspace.deleteBaileysInstance`, `workspace.connectBaileys`, `workspace.requestBaileysPairingCode`, `workspace.disconnectBaileys`.

Exclusão exige confirmação explícita no cliente e `confirmDeletion: true` no input. Segredos internos continuam mascarados e nenhuma chave de serviço é retornada.

### Endpoints internos do gateway

Todos, exceto probes de saúde internos, exigem `Authorization: Bearer <WHATSAPP_API_KEY>`:

- `GET /api/instances` — lista;
- `POST /api/instances` — cria;
- `GET /api/instances/{instanceId}` — estado;
- `PATCH /api/instances/{instanceId}` — rename;
- `DELETE /api/instances/{instanceId}` — remove sessão física;
- `GET /api/instances/{instanceId}/qr`;
- `POST /api/instances/{instanceId}/connect`;
- `POST /api/instances/{instanceId}/pairing-code`;
- `POST /api/instances/{instanceId}/disconnect` e `/logout`.

Essas rotas são serviço-a-serviço dentro da rede Docker, não a REST empresarial desativada.

---

## 5. IA: papéis separados para as próximas fases

**Modelo** é o serviço/família que executa inferência. **Agente** é uma função de produto que combina instruções, contexto, ferramentas e regras de decisão; um agente pode invocar modelos diferentes conforme a operação. Não chamar todo modelo de agente.

| Papel | O que faz | Planejamento |
|---|---|---|
| STT/transcrição | Converte áudio em texto | Chamar só em entrada de áudio/transcrição; resultado segue ao roteador da resposta |
| Visão | Interpreta imagem e, se suportado, frames de vídeo | Chamar só quando a mensagem contém imagem/vídeo compatível |
| Modelo de resposta | Redige resposta ao cliente | É invocado pelo agente de atendimento com prompt aprovado do workspace |
| Agente de atendimento WhatsApp | Orquestra tipo de entrada, contexto da conversa, prompt do usuário, tools e política de envio | Não é a credencial/provedor; precisa de modo simulado, logs e aprovação antes de envio automático |
| Configurador/onboarding | Ajuda owner/admin a organizar dados, rascunhos e configuração do workspace | Deve propor alterações como draft; não pode publicar sem ação autorizada |
| Ajuda da plataforma | Responde como usar o Forte Panel, apoiado por documentação completa e versionada | Não está validado como suporte contextual completo; `AIChatBox` sozinho não prova que o agente conheça o produto |
| Copiloto do Console Admin | Ajuda a operar providers, modelos e diagnósticos | É separado do agente que atende o WhatsApp e do suporte ao workspace |

A orquestração por modalidade deve ser explícita: texto → agente/resposta; áudio → STT → agente/resposta; imagem → visão → agente/resposta; vídeo/documento → extrator/modalidade suportada → agente/resposta. Não enviar uma imagem para modelo exclusivo de áudio nem presumir que um único modelo atende todas as capacidades.

O Console Administrativo futuro deve seguir o layout responsivo do workspace (sidebar móvel, header e páginas), mas separar **Providers e credenciais**, **Modelos**, **Capacidades/rotas**, **Agentes e prompts**, **uso/custo**, teste de conexão e auditoria. URLs/chaves ficam no servidor, criptografadas em repouso, mascaradas em respostas e acessíveis apenas a administradores da plataforma. O usuário do workspace seleciona prompt e preferências autorizadas, não recebe chave do provider.

A auditoria mais detalhada de capabilities, credenciais existentes e lacunas continua em `AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md`, `CONFIGURACAO-MULTIMODEL-AGENTE.md` e `CORE-PIPELINE-AUDIT-2026-09-27.md`; esses documentos são referências das próximas fases, não motivo para abrir mais telas agora.

---

## 6. O que não está incluído nesta etapa

- Console Admin de providers/modelos/chaves;
- agente de configuração de plataforma ou chat de ajuda do produto;
- prompt de produção, resposta automática e envio sem operador;
- testes reais de mensagem para texto, áudio, imagem, vídeo ou documentos;
- ativação do n8n, API empresarial, Meta Cloud API ou outros provedores de WhatsApp;
- exclusão das demais páginas, tabelas PAPI legadas, funcionalidades de agenda/CRM ou volumes de dados;
- deploy/alteração de produção ou migração para OCI.

Uma etapa posterior pode remover código comprovadamente morto após busca de referências, testes e revisão de impacto. Até lá, páginas fora do core ficam desativadas pela flag, e componentes com outros usos permanecem. Nenhum volume, sessão não selecionada ou dado do workspace deve ser apagado como “limpeza”.

---

## 7. Validação e limite deste ambiente

Executar antes de integrar o próximo core:

- `pnpm check` — checagem TypeScript do app/backend;
- `pnpm exec tsc --noEmit -p forte-whatsapp/tsconfig.json` — checagem do gateway;
- `pnpm test` — suíte monorepo, incluindo testes do gateway;
- `pnpm build` — build de produção;
- `DATABASE_URL=<URL de teste> pnpm exec drizzle-kit check` — consistência de journal/snapshots;
- `git diff --check` — whitespace.

As migrations 0038/0039 foram aplicadas com sucesso no PostgreSQL 16 pelo workflow de integração do GitHub e a suíte completa passou sem testes ignorados nesse ambiente. **O sandbox não possui o Docker/PostgreSQL local do usuário:** nenhuma migration foi aplicada a um banco/volume do usuário nesta tarefa. A execução real no Compose, QR com número de teste e validação visual no WSL Docker permanecem como gate explícito da etapa 1.

Última validação local: `pnpm test` — 137 passaram, 41 ficaram skipped por dependências de ambiente/DB; `pnpm check`, TypeScript do gateway, `pnpm build`, `drizzle-kit check` e `git diff --check` passaram. Os 22 testes isolados do gateway passaram com `npm ci`, `npm run check` e `npm test`. A CI `PostgreSQL integration` também passou no commit `b09fe05`. O build mantém um aviso preexistente de bundle JS > 500 KB. As migrations foram revisadas manualmente para conter **somente** os dois índices Baileys novos — sem tipos, tabelas ou indexes históricos duplicados.

Validação sandbox desta correção de pareamento/DDI: 142 testes passaram e 41 ficaram skipped na suíte do monorepo; 27 testes do gateway passaram; TypeScript do painel/gateway e builds de produção do painel, servidor e gateway passaram. O teste de número real e a conferência visual continuam pendentes no Docker local do usuário.

---

## 8. Próxima decisão do usuário

Revisar este fluxo e a UI de **Instâncias WhatsApp**. Depois, indicar correções de ordem/escopo ou aprovar a próxima fatia. Não iniciar configuração de modelos nem automação de respostas antes desse retorno.
