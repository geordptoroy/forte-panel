# Fluxo único de desenvolvimento e release

**Âmbito:** procedimento operacional do Forte Panel. As regras permanentes para agentes estão em [`AGENTS.md`](../AGENTS.md); o estado variável da tarefa fica em [`STATUS-ATUAL.md`](STATUS-ATUAL.md). Este documento substitui instruções antigas de handoffs quando houver contradição.

## 1. Uma linha de produto

A origem canónica é o repositório `geordptoroy/forte-panel` e a branch duradoura é `main`. Não abrir uma nova branch de longa duração para cada chat, não empilhar PRs e não escolher uma base a partir de uma instrução antiga sem confirmar o SHA remoto. Se a proteção do GitHub exigir revisão, a branch deve ser curta e apontar diretamente para `main`; nunca servir de base a outra PR.

Quando existirem duas histórias divergentes, primeiro registar os SHAs, comparar commits e alterações por domínio, e preparar uma única candidata local baseada na `main` mais recente. Conflitos de schema, migrations, API, UI ou segurança são resolvidos por intenção funcional e testes — não pela idade do commit nem por `ours/theirs`. Nenhuma ref remota é apagada, reescrita ou forçada durante esta reconciliação.

Antes de uma tarefa, confirmar repositório, branch, `HEAD`, árvore de trabalho e `origin/main`. No final, manter apenas um registo atual em `docs/STATUS-ATUAL.md`. Handoffs e auditorias anteriores ficam como arquivo histórico: são evidência do que foi observado naquela data, não instruções para trocar de branch ou imagem hoje.

## 2. Como escolher dependências e bibliotecas

Antes de adicionar uma biblioteca, verificar primeiro se a dependência já existente cobre o caso. Preferir os contratos e bibliotecas que o projeto já usa — por exemplo, Drizzle para schema/migrations, Zod para validação, tRPC para contratos internos e Baileys para o gateway WhatsApp. Uma biblioteca nova só entra quando reduz claramente código próprio e risco operacional, tem manutenção e compatibilidade adequadas, e o comportamento fica coberto por testes. Não acrescentar uma dependência apenas para mascarar conflitos de integração ou introduzir uma abstração maior que o problema.

As mudanças devem ser pequenas, rastreáveis e testáveis por contrato. Para cada correção, identificar o estado atual da `main`, o comportamento exclusivo da outra linha, o código que será preservado e a prova que demonstra compatibilidade.

## 3. Dados reais, demo e testes

A instância real do utilizador não é ambiente de teste. Não inserir contactos, mensagens, empresas ou faturação fictícios nela. Dados de fixture podem existir apenas em testes isolados. O runtime de produção não pode criar dados demo nem expor uma mutation pública de seed.

A validação de base de dados deve usar PostgreSQL descartável/local ou o serviço efémero do CI. Executar migrations numa base vazia e testar a atualização a partir do schema da `main`; exigir zero testes de integração ignorados. Não usar Supabase sem autorização explícita sobre a instância e a operação pretendida. Não emparelhar WhatsApp, apagar sessões nem enviar mensagens sem uma autorização específica e um número de teste dedicado.

## 4. Gates técnicos obrigatórios

Antes de integrar uma candidata, executar e registar:

| Área | Gate |
|---|---|
| Aplicação | `pnpm check`, testes completos e `pnpm build` |
| PostgreSQL | cadeia de migrations numa base vazia e upgrade a partir de `main`; suite completa sem skips DB |
| Configuração | validator de produção com flags seguras e sem credenciais reais |
| Gateway WhatsApp | `npm test`, `npm run check` e `npm run build` em `forte-whatsapp` |
| Release | workflow só publica depois de todos os gates anteriores, incluindo PostgreSQL, passarem |

Um resultado verde de build não demonstra que o produto esteja pronto para público. Antes de chamar «beta pública», verificar signup real, isolamento entre workspaces, fluxos da Inbox/agenda/orçamentos, reconexão e envio controlado de WhatsApp, readiness, backups/restauro, email e restantes dependências externas aplicáveis.

## 5. Imagem principal e publicação

Os caminhos operacionais mantêm-se fixos:

- `ghcr.io/geordptoroy/forte-panel:latest`
- `ghcr.io/geordptoroy/forte-whatsapp:latest`

Apenas um push em `main` pode publicar essas tags. Tags `sha-*` podem ser conservadas para rastreabilidade, mas não são uma imagem que o utilizador tenha de escolher. Não publicar `:dev`, não alterar o caminho GHCR e não usar um Compose que aponte para uma imagem diferente. O workflow de publicação deve depender do sucesso da verificação completa no mesmo fluxo; um workflow PostgreSQL separado não é um gate suficiente se o publish não esperar por ele.

Depois de publicar, aguardar a conclusão dos workflows e confirmar que o commit e o digest correspondem à `main`. Não anunciar a publicação enquanto qualquer job estiver a correr ou falhado. A promoção para `main` e o publish são passos distintos da validação local e não são feitos enquanto o utilizador só autorizou trabalho na candidata.

## 6. Atualizar a instalação local

Depois de a imagem principal `latest` estar publicada, o procedimento apresentado ao utilizador é somente:

```powershell
git pull
.\scripts\start-docker.ps1
```

O modo normal descarrega a imagem publicada, recria a stack e preserva PostgreSQL, Redis e sessão WhatsApp. Não apresentar comandos Docker alternativos para uma atualização habitual.

O reset é uma segunda opção, destrutiva para os dados da stack Forte Panel, e requer escolha expressa do utilizador:

```powershell
.\scripts\start-docker.ps1 -Reset -ResetConfirmation APAGAR-TUDO
```

O reset deve limitar-se à stack do Forte Panel e preservar os restantes projetos Docker da máquina. Não usar reset para aplicar uma imagem nova. O script antigo `dev-reinstall.ps1` fica apenas como compatibilidade e encaminha para `start-docker.ps1`.

## 7. Handoff entre tarefas

No final de uma sessão, `docs/STATUS-ATUAL.md` regista a branch e SHA exatos, alterações feitas, resultado de cada gate, workflow/digest se já existir, limitações e uma única próxima ação. Não copiar o mesmo estado para vários handoffs. Se o trabalho não foi publicado, escrever explicitamente «candidata local; sem push nem GHCR».
