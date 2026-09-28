# Ambiente de desenvolvimento e política de integrações

**Atualizado:** 2026-09-27
**Fonte:** decisão explícita do responsável pelo produto durante a auditoria do Forte Panel.

## 1. Contexto de desenvolvimento do responsável

- O usuário está desenvolvendo e executando a aplicação **localmente em Docker dentro do WSL**, usando o **Windows Terminal com PowerShell** como terminal de trabalho.
- Ao preparar comandos ou instruções locais, preferir PowerShell/Compose compatível com o fluxo Windows → WSL → Docker. Não presumir caminhos Linux do sandbox como caminhos do PC do usuário.
- O shell/container de trabalho do agente é um sandbox Linux separado; não presumir que enxerga o daemon Docker, volumes, `.env`, sessão do WhatsApp ou arquivos locais do WSL do usuário. Só declarar Docker/E2E local testado se o comando foi executado e observado nesse ambiente.
- **Oracle Cloud Infrastructure (OCI/Oracle Cloud)** é o destino futuro de hospedagem. A aplicação ainda está na fase de desenvolvimento local; este registro não inicia provisionamento, migração, mudança de DNS, deploy, cobrança ou exposição de tráfego.

### Máquina local de teste

- **Dispositivo:** `DESKTOP-QQ66S0L`, Windows 64-bit/x64, Windows Terminal com PowerShell, Docker Desktop e WSL; contexto Docker observado: `desktop-linux`.
- **CPU:** AMD Ryzen 5 5600G com Radeon Graphics, 3.90 GHz.
- **Memória:** 16.0 GB instalados (13.8 GB utilizáveis).
- **Armazenamento informado:** SSD XrayDisk de 480 GB (447 GB reportados como disponíveis) e HDD WDC WD10JPCX-24UE4T0 de 932 GB.
- **GPU:** AMD Radeon(TM) Graphics, 2 GB.
- Os Device ID e Product ID foram intencionalmente omitidos deste repositório público.

### Estado Docker observado no incidente de 2026-09-27

- `docker context show` retornou `desktop-linux`; `docker ps -a` e `docker volume ls` não listaram containers nem volumes. `docker inspect` não encontrou `forte_postgres_panel` nem `forte_panel_migrations`; o inventário de volumes também saiu vazio ao consultar os contextos tentados.
- Antes disso, um log mostrou o PostgreSQL inicializando um cluster novo e, em seguida, o serviço de migrations falhando com `./docker-entrypoint.sh: not found`. O entrypoint de migrations não rodou, portanto esse log não comprova aplicação das migrations do app.
- O histórico do PowerShell/PSReadLine indica uma tentativa de digitar `docker compose down -v`, mas o crash do terminal impede confirmar o resultado do comando. Como nenhum volume está visível no inventário observado, **não assumir que os dados/sessões anteriores continuam disponíveis nem que foram recuperados**.
- Antes de iniciar outro `compose up`, verificar possíveis backups e mounts do host. Não executar `down -v`, remoção de volume ou reset como tentativa de recuperação; documentar qualquer novo resultado antes de prosseguir.

## 2. Decisão sobre n8n e API REST de integração

A intenção inicial de conectar o fluxo de mensagens a um n8n foi abandonada. Não há arquivo/workflow/configuração n8n nem chamadas da interface do browser aos endpoints REST empresariais no repositório atual. Os consumidores encontrados da REST v1 são testes de contrato e o workflow manual de E2E de staging.

A API v1 existente **não é anônima**: as operações empresariais verificam uma `FORTE_API_KEY`; várias também usam o vínculo `FORTE_API_WORKSPACE_ID`, que limita o deployment atual a um workspace. Mesmo assim, ela é uma superfície de integração de servidor e não deve ser confundida com os endpoints internos/necessários do WhatsApp.

| Alternativa | Trade-offs | Custo/runtime | Complexidade de setup |
|---|---|---:|---|
| Apagar já todo o módulo de REST empresarial | Remove a superfície e o código legado, mas exige extrair primeiro probes/callback Baileys, migrar os testes E2E e abandonar compatibilidade com futuras integrações. | O router usa espaço de código server-side; as rotas não adicionam carregamento ao frontend. Economia de runtime esperada baixa enquanto estiver sem tráfego. | Alta nesta etapa; mudança destrutiva e maior risco de romper validação/staging. |
| Manter o contrato no código, fechado por padrão e opt-in explícito | Mantém compatibilidade de staging sem deixar CRM/agenda/mensagens disponíveis como API de produto. Permite remover o legado depois de confirmar consumidores reais. | Sem chamadas/carga quando fechado; não pesa o bundle do navegador. | Baixa: flag por ambiente; esta opção implementa a direção escolhida pelo responsável. |

### Política aplicada

- `FORTE_PUBLIC_API_ENABLED` fica `false` por padrão nos Compose local e de produção. Somente o valor literal `true` expõe as rotas empresariais; as demais respostas são `404`.
- A inicialização Docker local não exige nem gera `FORTE_API_KEY` e não exige um segundo `WEBHOOK_SIGNING_SECRET` genérico. Uma integração futura terá de ser habilitada deliberadamente, receber chave server-side e passar revisão de tenancy, escopo, expiração/rotação e auditoria.
- Como `scripts/validate-flow.mjs` ainda testa o contrato REST, o **servidor descartável de staging** precisa ser configurado explicitamente com `FORTE_PUBLIC_API_ENABLED=true` e chave de staging antes do workflow manual `Staging end-to-end`. O runner do workflow é cliente e não altera configuração do servidor. Não executar esse workflow em produção.
- Não existe conexão configurada com n8n e nenhuma é planejada no core atual.
- `GET /api/v1/health` e `GET /api/v1/ready` permanecem probes operacionais de baixa informação.

## 3. Comunicação Baileys que deve continuar

O gateway próprio `forte-whatsapp` é o canal operacional escolhido. A comunicação Panel↔gateway pela rede privada Docker, a chave operacional do gateway e o callback de eventos recebido pelo endpoint `/api/v1/webhooks/providers/baileys` são **integração interna essencial**, não API aberta para workflows externos. O callback continua ativo e autenticado pelo segredo/assinatura Baileys; mídia/mensagens e a persistência continuam passando pelos adapters/worker do produto.

O endpoint ainda usa `FORTE_API_WORKSPACE_ID` como associação de workspace do deployment. Migrar a resolução de tenant para um vínculo verificado por instância Baileys é dívida futura; não remover essa variável até concluir e testar tal migração.

## 4. Serviços externos: permitir somente quando a função precisar

- **Baileys/WhatsApp:** conexão de transporte necessária para a instância selecionada; callback restrito ao gateway interno e autenticação server-side.
- **Modelos de IA:** requisições server-side para provider/modelo configurado e aprovado no Console Administrativo. Nenhuma API key de modelo deve ir para browser, prompt ou Git.
- **Serviço interno de modelo/Forge e armazenamento:** o código atual também usa o endpoint configurado pelo servidor em utilitários como LLM, transcrição de onboarding, armazenamento e notificações. São dependências condicionais das funções que já usam esses serviços, não uma API para o n8n.
- **Meta Cloud API:** adapter opcional existe no código, mas a configuração local de tokens/phone-number ID é vazia; não é o canal ativo escolhido para o core. Não ofertar na primeira UI de conexão nem habilitar sem nova decisão.
- **E-mail/OAuth:** entrega de e-mail está desligada no ambiente local (`EMAIL_DELIVERY_ENABLED=false`); login local é a opção presente. `OAUTH_SERVER_URL` e `VITE_OAUTH_PORTAL_URL` ficam vazios no exemplo local; OAuth externo só é ativado quando houver uma decisão/configuração própria.
- Não adicionar integrações, webhooks públicos de negócio, polling externo ou sincronização com terceiros sem uma necessidade de produto registrada, finalidade, owner, dados enviados, secrets, autenticação e teste de isolamento.

## 5. Preferência de trabalho com Git

Para alterações solicitadas neste repositório, o usuário autorizou o fluxo regular de **editar → validar → criar commit → enviar (push) para uma branch de trabalho/atualizar PR**, sem pedir uma confirmação separada a cada mudança documental ou commit relacionado à tarefa. Manter cada fatia revisável e registrar evidência de testes; preferir branches/PRs a commits diretos em `main`.

Essa preferência não significa colocar secrets no Git nem declarar produção pronta. Deploy em OCI, exposição de serviços/dados reais ou ações destrutivas seguem o processo e as confirmações aplicáveis quando houver impacto material.

## 6. Próxima ordem de execução do produto

1. Core pós-login: conexão da instância Baileys e consumo.
2. Transporte de mensagens e uso sem IA.
3. Provider/registry de modelos e rotas/capabilities.
4. Agente de atendimento, depois imagem/documentos e áudio.
5. Configurador do negócio, ajuda dentro do Forte Panel, copiloto/admin e reabertura gradual das demais áreas.

A auditoria completa e os gates de cada fatia estão em [`AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md`](./AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md).
