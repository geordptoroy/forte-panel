

## Etapa 3 — Provisionamento PAPI Cloud — implementado atrás de flag

Foi criado o cliente backend `server/integrations/papi-cloud.ts`, que usa o token SaaS somente no servidor para:

- criar instância;
- recuperar API key da instância;
- rotacionar API key;
- configurar webhook com eventos `messages` e `status`;
- consultar status;
- remover instância durante rollback de provisionamento incompleto.

A tela **Canais conectados** ganhou o formulário de provisionamento Cloud. A operação cria a instância remota, cria o webhook local, configura o webhook remoto e salva a API key criptografada em `whatsappInstances`. Se a configuração falhar, o webhook local e a instância remota são removidos em tentativa de rollback.

O provisionamento não fica ativo por padrão. São necessárias as duas condições abaixo no backend:

```env
PAPI_CLOUD_PROVISIONING_ENABLED=true
PAPI_CLOUD_PANEL_TOKEN=sk_live_...
```

A escolha do provider de operação continua separada:

```env
PAPI_DEPLOYMENT=self_hosted
```

Enquanto esse valor permanecer `self_hosted`, o envio local continua usando a PAPI self-hosted. A troca para `cloud` só deve ocorrer depois de validar uma instância real.

A API key Cloud nunca é retornada para o frontend. Na criação, a interface recebe somente o `instanceId`, URL do webhook e o segredo do webhook para cópia única. O token SaaS e a API key da instância ficam no backend.

### Limitação atual

O contrato da PAPI Cloud foi implementado conforme a documentação enviada, mas não foi executada uma chamada real porque nenhum `PAPI_CLOUD_PANEL_TOKEN` foi fornecido/configurado nesta sessão. Antes de usar em produção, validar com uma instância de teste:

1. criar instância;
2. confirmar QR/status na PAPI;
3. verificar recebimento de mensagem;
4. enviar resposta pelo Panel;
5. testar status e `fromMe`;
6. testar rotação de API key;
7. confirmar assinatura/segredo e retry do webhook.

Não configurar `PAPI_DEPLOYMENT=cloud` no ambiente local antes desse smoke test.
