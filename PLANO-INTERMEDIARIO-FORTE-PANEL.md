

### Etapa atual — entidade persistente de instâncias — concluída

Foi criada a migration `drizzle-pg/0012_whatsapp_instances.sql` e o schema `whatsappInstances`. A entidade separa workspace, canal, provider, deployment (`self_hosted` ou `cloud`), `instanceId`, status, instância padrão, webhook e credenciais criptografadas.

A API interna agora possui listagem segura (`papiInstances`) e seleção de instância padrão. As listagens retornam apenas chave mascarada; o segredo é descriptografado somente no backend durante o envio. Ao criar um webhook PAPI pela interface, o registro também é sincronizado com a entidade de instância.

O worker outbound passou a preferir a API key criptografada vinculada ao `instanceId`, mantendo fallback para `PAPI_API_KEY` enquanto os registros antigos são migrados. O login proprietário único não foi alterado.

Validação desta etapa:

- `pnpm check`: passou.
- `pnpm test`: 39 passaram; 13 continuam ignorados por dependerem de banco/configuração externa.
- `pnpm build`: passou.
- `git diff --check`: passou.
- Journal JSON de migrations: válido.

### Próxima etapa imediata

Migrar a tela de **Canais conectados** para consumir `papiInstances`, fazer backfill controlado dos webhooks/settings legados e ligar o endpoint de webhook ao registro persistido. Em seguida serão adicionados os endpoints de provisionamento PAPI Cloud, mas o deployment local continuará self-hosted até os testes do contrato Cloud.
