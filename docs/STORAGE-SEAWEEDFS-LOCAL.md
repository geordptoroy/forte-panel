# Storage privado local — SeaweedFS S3

Esta candidata usa **SeaweedFS** como storage S3-compatible local. O Panel e o worker guardam apenas a referência do objecto, MIME, tamanho e hash; o conteúdo fica no volume `forte_seaweedfs_data`.

## Configuração local

No `.env` local, definir valores fortes que não sejam commitados:

```dotenv
FORTE_STORAGE_ENDPOINT=http://seaweedfs:8333
FORTE_STORAGE_REGION=us-east-1
FORTE_STORAGE_BUCKET=forte-private
FORTE_STORAGE_ACCESS_KEY=forteadmin
FORTE_STORAGE_SECRET_KEY=trocar-por-um-segredo-forte
FORTE_STORAGE_FORCE_PATH_STYLE=true
```

O Compose cria um volume separado para os dados do SeaweedFS e um volume de configuração para as credenciais S3. Não são tocados os volumes do PostgreSQL, Redis ou sessão Baileys.

## Operação

- A API S3 fica apenas em `127.0.0.1:${FORTE_STORAGE_PORT:-8333}` no host.
- Dentro da rede Docker, o Panel e o worker usam `http://seaweedfs:8333`.
- URLs assinadas expiram em 5 minutos.
- As chaves continuam obrigatoriamente limitadas ao prefixo do workspace.
- Não colocar `FORTE_STORAGE_SECRET_KEY` no Git, logs ou mensagens.

## Migração posterior

Para AWS S3, Cloudflare R2, Backblaze B2 ou outro S3 compatível, trocar apenas o endpoint, bucket e credenciais no ambiente. O adapter S3 do Panel não depende de MinIO ou SeaweedFS.

## Limite desta candidata

SeaweedFS é adequado para staging/local. Para publicação pública, usar um serviço gerido ou uma operação dedicada com backups, TLS, monitorização, rotação de credenciais e política de retenção. Esta alteração ainda não foi integrada em `main`, publicada no GHCR nem aplicada à stack activa.
