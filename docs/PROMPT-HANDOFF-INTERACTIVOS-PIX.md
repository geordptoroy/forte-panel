# Handoff para a próxima IA — Forte Panel interactivos e Pix

Continua o trabalho no repositório `geordptoroy/forte-panel`, worktree local `C:\Users\Rafae\Desktop\forte-panel-papi-fix`.

## Estado confirmado

A integração nativa Baileys de botões, listas, carrosséis, enquetes e Pix está implementada. A `main` foi actualizada para o commit `450b53d` (`fix: separate native Pix payment envelopes`) com fast-forward, sem force-push.

O Gateway usa apenas Baileys. Não adicionar providers alternativos, forks externos ou Supabase.

## Correcção mais recente

O WhatsApp Web não conseguia abrir Pix sem valor porque o envelope `payment_info` continha campos de cobrança vazios (`reference_id`, `type`, `payment_configuration` e `order_request_id`).

A variante sem valor agora contém apenas:

- `payment_settings` com `pix_static_code`;
- `currency: "BRL"`;
- botão Native Flow `payment_info`;
- corpo `{ text: "" }`;
- nós adicionais `biz` e `bot` já existentes.

A variante com valor permanece separada e usa:

- botão `review_and_pay`;
- `type: "physical-goods"`;
- `payment_configuration: "merchant_categorization_code"`;
- `total_amount: { value: amountCents, offset: 1000 }`;
- `reference_id` e `order_request_id` gerados quando não fornecidos;
- sem objecto `order`.

A UI aceita reais (`10`, `10,50` ou `10.50`) e converte para centavos. Campo vazio não deve criar valor mínimo nem `total_amount`.

## Outros fixes incluídos

- Botões da UI usam o contrato REST `id`/`displayText`, não `buttonId`/`buttonText`.
- Fallback textual automático foi desactivado para botões nativos.
- O renderer da Inbox não mostra `[button]`; apresenta preview estruturado de botões/Pix.
- A IA envia `disableFallback: true` nos interactivos.
- O resolver de JID continua a tentar variantes brasileiras com e sem o nono dígito.

## Validação

- Gateway `npm run check`: passou.
- Gateway suite completa: 105/105 testes passou antes da última correcção; após a separação Pix, os testes direccionados Pix/wire/payload passaram 10/10.
- Gate Linux limpo da aplicação terminou com exit code 0.
- A suite raiz no Windows tem falhas ambientais nos testes de backup/restore porque `tar` não interpreta caminhos Windows `C:\...`; há também timeout flutuante no teste de carousel. Não tratar essas falhas como regressão da correcção Pix sem reproduzir no CI/Linux.

## Stack local disposable

A stack candidate fica em `.work/disposable-candidate/`, projecto Compose `forte-candidate-interactives`:

- Panel: `http://localhost:3302`;
- Gateway: `http://localhost:3310`;
- volumes e PostgreSQL são disposable;
- não tocar nos containers/volumes da instalação original.

Depois de alterar o Gateway, recriar apenas o serviço candidate com o Compose dessa pasta e verificar `/ready`. Não emparelhar nem enviar para WhatsApp real sem autorização explícita e número dedicado.

## Próximos passos

1. Recriar o serviço Gateway disposable usando a imagem construída depois do commit `450b53d`.
2. Testar visualmente no Panel candidate Pix sem valor e Pix com valor, confirmando que Web e telefone abrem ambos os cartões.
3. Se o Pix sem valor ainda falhar, capturar o payload serializado e comparar somente campos estruturais com a captura validada anteriormente; não reintroduzir campos vazios.
4. Executar os gates no CI/GitHub e confirmar o commit de `main` e os digests GHCR antes de declarar release.
5. Para actualizar a instalação real, usar apenas o procedimento documentado: `git pull` e `scripts/start-docker.ps1`; nunca resetar dados sem confirmação explícita `APAGAR-TUDO`.
