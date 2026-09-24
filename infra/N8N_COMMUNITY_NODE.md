# Forte Panel como uma única AI Tool no n8n

## Decisão

O agente deve ter uma única tool chamada **Forte Panel**. Ela substitui a antiga tool do CRM e a tool da agenda. A tool não acessa bancos internos: chama exclusivamente `/api/v1` com `Authorization: Bearer` e usa idempotência nas mutações.

O pacote está em `packages/n8n-nodes-forte-panel` e já compila com `npm run build`.

## Teste local sem publicar no npm

Na máquina que executa o n8n, dentro do pacote:

```bash
npm install
npm run build
npm pack
```

Isso gera `n8n-nodes-forte-panel-0.1.0.tgz`. Instale o tarball no ambiente do n8n conforme a forma de execução:

```bash
npm install ./n8n-nodes-forte-panel-0.1.0.tgz
```

Em Docker, a instalação deve ocorrer em uma imagem customizada do n8n ou no diretório de community nodes persistido por volume. Depois da instalação, reinicie o n8n para que o node apareça.

## Configuração no workflow

1. Remova as duas tools antigas do conector `Tools` do AI Agent.
2. Adicione somente o node **Forte Panel**.
3. Crie a credencial **Forte Panel API**.
4. Use `http://forte-panel:3000/api/v1` como Base URL quando ambos os containers estiverem na mesma rede Docker.
5. Use a mesma chave de `FORTE_API_KEY` do painel.
6. Conecte o node Forte Panel uma única vez ao conector `Tools` do AI Agent.
7. Mantenha a tool de envio e alterações de agenda sob Human Review no n8n durante o piloto.

## Descrição recomendada para o agente

```text
Use a tool Forte Panel como única fonte de verdade do CRM e da agenda.
Nunca use Clientverse, Easy!Appointments, tabelas internas do n8n ou bancos do PAPI.

Para um lead, use buscar_lead antes de criar ou atualizar quando o telefone ainda não estiver identificado.
Use criar_lead ou atualizar_lead para persistir dados estruturados; use registrar_nota para observações internas.
Consulte availability antes de propor horários e use create_appointment somente depois da confirmação explícita do cliente.
Para cancelamento ou reagendamento, confirme a intenção e use a ação correspondente.
Use published_prompt para carregar as regras publicadas da empresa.
Use queue_message para enviar uma mensagem somente quando a resposta estiver pronta; status queued significa aceito pela fila, não entregue.
Não invente preço, disponibilidade, política ou confirmação.
``` 

## Observação importante

O export JSON do workflow original não está dentro do repositório neste momento. O pacote e o contrato já estão prontos; a troca dos dois nós no workflow concreto deve ser feita no export/import do n8n, preservando o restante do fluxo de mídia, debounce, memória e modelo.
