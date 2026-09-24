# n8n-nodes-forte-panel

Community Node do Forte Panel que consolida CRM, agenda, prompt publicado e fila de WhatsApp em **uma única AI Tool** para o n8n.

## O que substitui

No workflow final, conecte apenas o node **Forte Panel** ao conector `Tools` do **AI Agent**. Ele substitui as duas tools antigas do CRM/agenda. Clientverse e Easy!Appointments deixam de ser usados.

A tool oferece estas ações:

- `buscar_lead`
- `criar_lead`
- `atualizar_lead`
- `registrar_nota`
- `availability`
- `create_appointment`
- `cancel_appointment`
- `reschedule_appointment`
- `published_prompt`
- `queue_message`

O node está marcado com `usableAsTool: true`, portanto aparece entre as ferramentas disponíveis do AI Agent quando instalado.

## Instalação local

Dentro do pacote:

```bash
npm install
npm run build
```

Para uma instalação n8n via Docker, copie o pacote compilado para o diretório de community nodes configurado pelo n8n ou publique o pacote em um registry npm privado/público e instale pela interface de Community Nodes:

```bash
npm install n8n-nodes-forte-panel
```

O n8n precisa permitir community nodes no ambiente. Em instalação self-hosted, confirme a política de instalação de nodes antes de reiniciar o container.

## Credencial

Crie uma credencial **Forte Panel API**:

- **Base URL:** `http://forte-panel:3000/api/v1` quando os containers estiverem na mesma rede Docker;
- **API Key:** o mesmo valor de `FORTE_API_KEY` configurado no servidor.

A credencial envia `Authorization: Bearer <FORTE_API_KEY>` e o node nunca acessa diretamente o banco.

## Conexão no AI Agent

1. Instale o node.
2. Adicione um único node **Forte Panel**.
3. Selecione a credencial.
4. Conecte a saída do node ao conector **Tools** do AI Agent.
5. Mantenha o prompt do agente explicando que a tool é a fonte de verdade para CRM e agenda.
6. Para ações de envio (`queue_message`) e alterações de agenda, ative Human Review no n8n antes de colocar em produção.

O node usa `$fromAI()` nos campos principais para que o agente escolha a ação, telefone, IDs, horários, texto e campos estruturados. Para chamadas determinísticas fora do agente, todos os campos também podem receber valores fixos ou expressões n8n.

## Regra de operação

O Forte Panel é a fonte de verdade. O n8n continua responsável pela orquestração, debounce, mídia, memória conversacional e modelo de IA. O node usa a API versionada e idempotente do Panel; não lê tabelas internas do n8n, PAPI ou qualquer CRM legado.
