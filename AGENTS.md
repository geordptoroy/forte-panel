# Instruções permanentes — Forte Panel

Estas regras têm prioridade sobre handoffs e relatórios históricos. Antes de começar, ler também [`docs/STATUS-ATUAL.md`](docs/STATUS-ATUAL.md) e [`docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`](docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md).

## Fonte de verdade e Git

- Repositório canónico: `geordptoroy/forte-panel`. **Não criar outro repositório** para contornar a divergência.
- `main` é a única linha de produto duradoura. Não continuar automaticamente numa branch citada por um chat antigo. Antes de editar, confirmar repositório, branch, `HEAD`, estado da árvore e `origin/main` atual.
- Não fazer force-push, rebase global, reset de trabalho do utilizador ou merge cego por `ours/theirs`. Uma worktree/branch de integração pode ser usada temporariamente para reconciliar história, mas deve terminar numa única candidata validada para `main`.
- Não iniciar branches empilhadas nem deixar um handoff antigo sobrepor-se ao estado atual. O estado volátil fica apenas em `docs/STATUS-ATUAL.md`; os restantes handoffs são históricos.

## Imagens e publicação

- Caminhos operacionais fixos:
  - `ghcr.io/geordptoroy/forte-panel:latest`
  - `ghcr.io/geordptoroy/forte-whatsapp:latest`
- A publicação de produto deve originar-se **apenas de `main`**, depois de todos os gates do mesmo workflow passarem. `sha-*` serve apenas para rastreabilidade. **Não criar nem usar `:dev`** e não mudar nomes ou caminhos GHCR.
- Aguardar a conclusão dos jobs de verificação e publicação no GitHub. Confirmar sucesso, commit de `main` e digest da imagem antes de dizer que foi publicada ou pedir ao utilizador para atualizar.
- Não publicar, fazer merge ou alterar a instalação real enquanto a validação local estiver incompleta. Mostrar o resultado e obter a autorização necessária para a ação externa.

## Atualização da instalação local

Depois de a imagem `latest` estar publicada, dar ao utilizador apenas o procedimento documentado: `git pull` e o script oficial [`scripts/start-docker.ps1`](scripts/start-docker.ps1). Não pedir comandos Docker avulsos nem sugerir outra tag.

- Execução normal do script: descarrega `latest`, recria a stack e **preserva** PostgreSQL, Redis e sessão WhatsApp.
- Reset: só se o utilizador o escolher expressamente e confirmar `APAGAR-TUDO`; apaga os dados locais da stack Forte Panel. Nunca executar reset durante uma atualização normal. Os restantes projetos Docker devem ser preservados.
- `scripts/dev-reinstall.ps1` é apenas compatibilidade com o nome antigo e encaminha para o script oficial.

## Canal WhatsApp

- O único canal/provedor de produto é **Baileys**, via gateway interno `forte-whatsapp`. Não criar seleção de provider, adapter, credencial, variável de ambiente ou fluxo de produto para outro serviço.
- A PAPI pode ser consultada **apenas para revisão de engenharia**; não é dependência nem provider do Forte Panel. Não adicionar um provider oficial alternativo.
- Preservar migrations já aplicadas e dados históricos necessários a upgrades; referências em auditorias técnicas não tornam esses serviços opções de produto.

## Dados, demonstrações e testes

- Não inserir, semear ou apresentar dados mock/demo na instância real do utilizador. O modo demo tem de permanecer bloqueado em `NODE_ENV=production`; não reintroduzir um endpoint público de seed.
- Fixtures são permitidas apenas em testes isolados. Testes de integração devem usar PostgreSQL descartável/local ou o serviço efémero do CI, nunca uma base real por omissão.
- **Não usar Supabase nesta tarefa**: o utilizador escolheu não o utilizar. Para qualquer futuro teste que escreva em serviços externos, confirmar primeiro o alvo e o impacto.
- Não emparelhar WhatsApp, limpar sessões, enviar mensagens ou testar integrações reais sem autorização específica e número de teste dedicado.

## Gates antes de integrar/publicar

1. `pnpm check`, testes completos da aplicação contra PostgreSQL, migrations numa base vazia **e** upgrade a partir do schema da `main`, sem testes DB ignorados.
2. Validator de configuração de produção e `pnpm build`.
3. No gateway: `npm test`, `npm run check` e `npm run build`.
4. Rever segurança, isolamento por workspace, alterações de schema e documentação; registar resultados e limitações em `docs/STATUS-ATUAL.md`.
5. Para declarar beta pública, exigir também smoke test da imagem exata e confirmação de fluxos reais autorizados. Um build verde, por si só, não prova prontidão pública.
