# Instalação e teste local do Forte Panel

O ambiente de desenvolvimento de referência é Windows 64-bit com Docker Desktop/WSL e PowerShell. A stack local baixa as imagens publicadas no GitHub Container Registry (GHCR); **não é necessário compilar imagens neste computador**.

## Instalar/reinstalar do zero — um comando

Abra PowerShell na raiz do repositório e execute:

```powershell
.\scripts\dev-reinstall.ps1 -ResetData
```

O script:

1. Confirma explicitamente a intenção pelo parâmetro `-ResetData`.
2. Inicializa `.env` com segredos locais aleatórios via WSL somente se o arquivo ainda não existir; nunca sobrescreve o `.env` existente.
3. Apaga containers, redes e volumes do projeto Docker `forte-local`, incluindo PostgreSQL, Redis e sessões Baileys.
4. Baixa as imagens `:dev` do GHCR e as imagens de dependências, como PostgreSQL e Redis.
5. Sobe a aplicação publicada e mostra o estado dos serviços.

Acesse <http://localhost:3002>. E-mail e senha do administrador local ficam em `.env` (`LOCAL_ADMIN_EMAIL` e `LOCAL_ADMIN_PASSWORD`). Não compartilhe nem versione esse arquivo.

**O reset remove os dados apenas do projeto `forte-local`.** Não apaga outras aplicações Docker, imagens locais, cache global ou arquivos fora do Docker. Não execute uma segunda stack com os mesmos `container_name` simultaneamente.

## O que é a conta que reaparece

Há duas coisas diferentes:

- O antigo workspace/dados fictícios são sementes de demonstração. Agora o modo demo é **opt-in** (`DEMO_MODE=true`) e o Compose local fixa `DEMO_MODE=false`, então um banco limpo não recria contatos, agenda ou canais de demonstração.
- `LOCAL_ADMIN_EMAIL` é o **administrador-bootstrap local**, necessário para conseguir entrar. Depois que você autentica com as credenciais do `.env`, o login cria/atualiza a linha `local_admin` no banco. Ela não é uma conta demo; após apagar o volume ela só volta quando você faz login de novo. Não a removi para não bloquear o acesso.

## Atualização sem apagar os dados

Se quiser baixar a publicação mais recente e atualizar sem resetar o banco/sessões:

```powershell
$env:DEMO_MODE = "false"
docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml pull
docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml up -d --remove-orphans
```

**Para uma atualização somente de interface, use os comandos acima sem `down --volumes` nem `-ResetData`: isso preserva o banco e a sessão WhatsApp já conectada.** Use `-ResetData` apenas quando quiser intencionalmente apagar PostgreSQL, Redis e sessões Baileys do projeto `forte-local`.

## Reteste do pareamento por número

Depois que a nova imagem `:dev` for publicada, atualize com o bloco **Atualização sem apagar os dados** acima para preservar a conexão existente, entre no painel e:

1. Em **Instâncias WhatsApp**, crie uma instância de teste.
2. No seletor, escolha país/bandeira/DDI; digite o número nacional com DDD/código de área, sem repetir o DDI.
3. Clique em **Gerar código**. O painel agora só exibe o código se o servidor do WhatsApp confirmar o pedido IQ; códigos têm 8 caracteres e podem incluir letras.
4. No aplicativo WhatsApp do aparelho, abra **Configurações → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone** e informe exatamente o código exibido.
5. Deixe a aba do painel em segundo plano enquanto confirma no celular. O status deve mudar automaticamente de pareamento/conexão para **Conectado** após o gateway abrir a sessão; ao voltar para a aba, o estado também é revalidado imediatamente.
6. Abra **Planos e consumo** na barra lateral e confirme que plano, cotas e janela de renovação estão nessa página, não na página das instâncias.
7. Se o IQ retornar erro/timeout, o painel deve mostrar o erro em vez de entregar um código que o servidor não aceitou.

O código exibido significa que o pedido foi aceito pelo servidor; ainda é necessário digitá-lo no telefone para concluir o vínculo. O QR continua disponível como alternativa.

## Diagnóstico rápido

```powershell
docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml ps -a
docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml logs --tail 100 forte-panel-migrations forte-panel forte-panel-worker forte-whatsapp
```

O erro anterior `No such image: redis:7-alpine` ocorreu porque `up --pull never` impediu baixar a imagem Redis que ainda não existia no Docker Desktop. O script novo executa `docker compose pull` antes de `up`.

## Publicação das imagens de desenvolvimento

Cada push validado à branch de trabalho publica `ghcr.io/geordptoroy/forte-panel:dev` e `ghcr.io/geordptoroy/forte-whatsapp:dev`, além da tag imutável `sha-*`. A tag `latest` permanece reservada para `main`. A publicação só ocorre se typecheck, testes e builds passarem.

Para puxar manualmente, sem subir a stack:

```powershell
docker pull ghcr.io/geordptoroy/forte-panel:dev
docker pull ghcr.io/geordptoroy/forte-whatsapp:dev
```

Em 2026-09-27, o manifest `:dev` das duas imagens respondeu HTTP 200 pelo token anônimo do GHCR; o pull não exige login no registry.

## Segredos e migrations

- `.env.docker.example` contém somente valores de exemplo; `scripts/docker-init-local.sh` gera `.env` com segredos aleatórios quando ele não existe.
- As migrations versionadas são executadas pelo serviço `forte-panel-migrations` antes do painel/worker. Não use `db:push` para substituir esse histórico.
- O Compose local publica o PostgreSQL apenas em `127.0.0.1`; não exponha essa porta à internet.


## Interface WhatsApp — 28/09/2026

A conexão Baileys/Forte Panel está funcional; esta revisão não altera gateway, sessão, banco ou contratos tRPC. O smoke test pendente é visual: criar instância pelo modal, avançar para QR ou número, conferir bandeira/DDI, responsividade, renomeação e exclusão. **Planos e consumo não aparece na sidebar nesta etapa**, pois a rota está temporariamente congelada junto das demais páginas não-core.


## Correção do workspace padrão — 2026-09-29

O login normal não cria mais `WORKSPACE_SLUG`/`WORKSPACE_NAME` implicitamente. O provisionamento padrão só ocorre quando `DEMO_MODE=true` ou quando `WORKSPACE_BOOTSTRAP_ENABLED=true` foi configurado de forma explícita. O signup público continua criando seu próprio workspace e membership transacionalmente.

Para remover o workspace local antigo **“Minha empresa”**, não use `down --volumes` e não apague o usuário do Console Admin. Faça backup antes e execute o script dentro do container PostgreSQL, depois de revisar as três identidades protegidas (`id=1`, `slug=forte-workspace`, `name=Minha empresa`):

```powershell
# Backup obrigatório antes da exclusão
$env:PGPASSWORD = (docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml exec -T postgres printenv POSTGRES_PASSWORD)
docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml exec -T postgres pg_dump -U forte_panel -d forte_panel -Fc > forte-panel-before-workspace-delete.dump

# Injeta a confirmação exata no stream, sem alterar o arquivo versionado.
$sql = (Get-Content .\scripts\delete-local-workspace.sql -Raw).Replace('REPLACE_WITH_EXACT_CONFIRMATION', 'APAGAR WORKSPACE FORTE 1')
$sql | docker compose --project-name forte-local --env-file .env --file docker-compose.local.yml exec -T postgres psql -U forte_panel -d forte_panel -v ON_ERROR_STOP=1
```

O script aborta se a confirmação não for exata, se não encontrar exatamente um workspace ativo com os três identificadores, ou se o registro ainda existir após a operação. Ele apaga linhas tenant-scoped que possuem `workspaceId`, além do workspace e membership, mas preserva `users`, `platformAdmins` e o acesso do Console Admin. A execução é transacional: qualquer erro gera rollback. Após a execução, faça login novamente e confirme que o workspace não reaparece; não habilite `WORKSPACE_BOOTSTRAP_ENABLED` no `.env` de produção/local normal.


## Smoke test limpo e cadeado de fluxos validados — 2026-09-29

O Workspace público e o Console Admin agora exibem um cadeado visual **Fluxo validado / Validado**. Ele marca os fluxos já aprovados e congelados para o smoke test; não substitui autorização, que continua sendo aplicada no backend. No Workspace público, o escopo operacional permanece limitado a Conexões e WhatsApp pelo `CORE_ONLY_MODE`. No Console Admin, a sessão continua obrigatória para qualquer operação de workspace.

Para apagar PostgreSQL, Redis e sessões Baileys e reinstalar a publicação limpa, use o script já protegido por confirmação explícita:

```powershell
.\scripts\dev-reinstall.ps1 -ResetData
```

Esse reset remove apenas volumes, containers e redes do projeto `forte-local`, baixa novamente as imagens `:dev` e sobe migrations, painel, worker e gateway. Não remove imagens/cache globais nem outros projetos Docker. Depois do reset, o primeiro login recria somente o usuário `local_admin`; o workspace padrão não é recriado porque `DEMO_MODE=false` e `WORKSPACE_BOOTSTRAP_ENABLED=false`.

Smoke test prioritário após a reinstalação, começando pelo Console Admin: login de `local_admin`; abrir Workspaces; selecionar workspace; iniciar sessão `read_only`; conferir cabeçalho e expiração; listar instâncias; criar uma instância somente em `operator`; gerar QR/código; parear no aparelho de teste; confirmar status conectado; testar recebimento e envio; desconectar a instância; conferir auditoria e isolamento do workspace. Só depois repetir o fluxo mínimo no Workspace público.
