

### Atualização posterior — publicação GitHub/GHCR e transferência

A branch `feat/o7.15-storage-reconciliation-observability` está sincronizada com o remoto no commit `78a8487` (`feat: add AI provider execution observability`), incluindo os commits anteriores `df7dfdc` (fallback explícito) e `eabf067` (gate de segurança). A PR #39 permanece aberta e **não foi mesclada**.

O workflow manual `Publish Forte Panel image` foi executado com sucesso no GitHub Actions: run `36798527753`. O job `verify` passou por typecheck, configuração de produção sintética, suíte completa, build de produção, testes/build do gateway WhatsApp e verificação de secrets. O job `publish` passou pelo Buildx multi-arch e publicou as imagens do Panel e do gateway WhatsApp no GHCR com tags `dev` e `sha-78a8487`, para `linux/amd64` e `linux/arm64`.

A tag `latest` continua reservada ao workflow executado na branch padrão `main`; não foi sobrescrita a partir desta branch de feature e nenhuma merge automática foi feita. Para o próximo chat, revalidar branch/status/hash e continuar pelo slice de transcrição de áudio usando a imagem `ghcr.io/geordptoroy/forte-panel:dev` somente quando a operação local exigir a imagem publicada. Não usar secrets reais, não repetir backup/restore, não parear outro número real, não desligar `CORE_ONLY_MODE` e não iniciar Oracle.
