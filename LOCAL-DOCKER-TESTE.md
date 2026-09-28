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

O comando de reinstalação acima é o recomendado nesta fase de desenvolvimento, pois você pediu para zerar os volumes em cada teste.

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

Se o GHCR informar que os pacotes não são públicos, o owner precisa publicar a visibilidade dos pacotes `forte-panel` e `forte-whatsapp` uma vez nas configurações do GitHub Packages. Depois disso, o script funciona sem login no GHCR.

## Segredos e migrations

- `.env.docker.example` contém somente valores de exemplo; `scripts/docker-init-local.sh` gera `.env` com segredos aleatórios quando ele não existe.
- As migrations versionadas são executadas pelo serviço `forte-panel-migrations` antes do painel/worker. Não use `db:push` para substituir esse histórico.
- O Compose local publica o PostgreSQL apenas em `127.0.0.1`; não exponha essa porta à internet.
