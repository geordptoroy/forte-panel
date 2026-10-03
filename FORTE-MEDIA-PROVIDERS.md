# Forte Panel — canal WhatsApp

**Estado atual (2026-10-02): Baileys-only.** Este documento descreve o único canal suportado pelo produto; não há selector de provider.

## Arquitetura

- O Panel gere workspaces, permissões e propriedade das instâncias.
- O serviço `forte-whatsapp` mantém a ligação Baileys e as sessões persistentes.
- O tráfego entre Panel e gateway é autenticado service-to-service; os callbacks são assinados e deduplicados.
- A UI não pede nomes de provider nem credenciais de serviços externos. Uma instância só pode ser usada no workspace a que pertence.
- Valores de canais antigos são rejeitados por novas operações. Migrations históricas não devem ser editadas; qualquer limpeza de dados reais exige inventário e plano de backfill próprios.

## Configuração operacional

As variáveis do gateway ficam apenas no servidor e seguem o exemplo `.env.local.example`/`.env.docker.example`, incluindo `BAILEYS_BASE_URL`, `BAILEYS_API_KEY`, `BAILEYS_WEBHOOK_SECRET` e `BAILEYS_INSTANCE_ID`. Nunca colocar esses valores no frontend, em prompts de agente ou no Git.

O Compose operacional usa os serviços do Forte Panel, PostgreSQL, Redis e o gateway `forte-whatsapp`. A atualização normal usa o script oficial documentado em [`docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`](./docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md) e preserva volumes e sessões.

## Segurança e limites

1. O ficheiro `.env` real permanece apenas na máquina/ambiente de deployment e nunca é commitado.
2. O gateway só envia quando existe instância autorizada e ligada; falhas não devem ser mascaradas como entrega.
3. QR e estado da sessão são acessíveis apenas a membros autorizados do workspace e não são registados como segredos.
4. Backups/restores devem incluir o estado cifrado da sessão e ser testados antes de serem considerados operacionais.
5. Baileys utiliza o protocolo WhatsApp Web/Linked Devices e não é a WhatsApp Business Platform; os riscos de sessão e alterações do protocolo devem ser comunicados honestamente.

A PAPI pode surgir **apenas** nos documentos de auditoria de engenharia como referência comportamental histórica; não é provider, adapter, dependência nem opção configurável do Forte Panel.
