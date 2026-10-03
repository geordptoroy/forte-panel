
> **DOCUMENTO HISTÓRICO — revisto em 2026-10-02.** Este ficheiro preserva decisões e evidências de um estado anterior e não define o produto ou os procedimentos atuais. O único canal do produto é Baileys. Não executar opções de canal, comandos, branches, tags ou tarefas pendentes daqui; consultar `AGENTS.md`, `PRODUCT_SCOPE.md`, `docs/STATUS-ATUAL.md` e `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`.



## 14. Auditoria transversal completa — segurança, desempenho, engenharia e UX

A auditoria definitiva foi complementada por uma revisão transversal de segurança, autorização, desempenho, escalabilidade, dados, migrações, testes, CI/CD, operação, confiabilidade, UI/UX, acessibilidade e aderência ao produto.

O relatório detalhado está em:

`AUDITORIA-TRANSVERSAL-SEGURANCA-DESEMPENHO-UX-FORTE-PANEL.md`

Os sete bloqueadores de release são: Baileys-only não enforced; idempotência que não chega ao efeito externo; inbound não transacional; mídia base64 no caminho síncrono; produto publicado incompleto; CI com testes críticos ignorados; e ações administrativas que podem escapar da sessão ou perder auditoria.

A recomendação é não convidar as dez empresas antes de fechar esses bloqueadores, executar staging Baileys com restore e repetir a validação em coorte de dez workspaces.


## 15. Execução incremental — limpeza do adapter legado

Em 2026-09-29 foram executadas duas fatias de remoção do legado: o adapter WhatsApp foi reduzido ao gateway Baileys, o módulo de provisionamento Cloud antigo foi removido, os testes do adapter foram convertidos para Baileys, a demo deixou de exibir canal Meta, o worker deixou de recuperar segredo PAPI e os helpers CRUD/webhook/default de PAPI foram removidos do data layer. O contrato runtime agora expõe somente Baileys, e as variáveis PAPI Cloud foram retiradas do ambiente.

O resultado não deve ser interpretado como remoção total do legado. O schema PostgreSQL, campos de compatibilidade e migrations antigas ainda preservam valores históricos para permitir uma migração de dados planejada; migrations aplicadas não serão editadas. A próxima etapa é inventariar dados por workspace/instância, testar uma migration de schema ativo exclusivamente Baileys em banco vazio e restaurado e validar o quality gate antes de limpar configurações históricas.
