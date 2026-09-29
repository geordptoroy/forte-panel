

## 14. Auditoria transversal completa — segurança, desempenho, engenharia e UX

A auditoria definitiva foi complementada por uma revisão transversal de segurança, autorização, desempenho, escalabilidade, dados, migrações, testes, CI/CD, operação, confiabilidade, UI/UX, acessibilidade e aderência ao produto.

O relatório detalhado está em:

`AUDITORIA-TRANSVERSAL-SEGURANCA-DESEMPENHO-UX-FORTE-PANEL.md`

Os sete bloqueadores de release são: Baileys-only não enforced; idempotência que não chega ao efeito externo; inbound não transacional; mídia base64 no caminho síncrono; produto publicado incompleto; CI com testes críticos ignorados; e ações administrativas que podem escapar da sessão ou perder auditoria.

A recomendação é não convidar as dez empresas antes de fechar esses bloqueadores, executar staging Baileys com restore e repetir a validação em coorte de dez workspaces.


## 15. Execução incremental — limpeza do adapter legado

Em 2026-09-29 foi executada a primeira fatia de remoção do legado: o adapter WhatsApp foi reduzido ao gateway Baileys, o módulo de provisionamento Cloud antigo foi removido, os testes do adapter foram convertidos para Baileys, a demo deixou de exibir canal Meta e o worker deixou de recuperar segredo PAPI. O typecheck passou e a suíte direcionada teve 199 testes aprovados, com 47 skips por dependência de banco externo.

O resultado não deve ser interpretado como remoção total do legado. O data layer ainda conserva helpers CRUD/webhook e tipos históricos para permitir uma remoção de dados planejada; as migrations antigas também preservam seus nomes porque não podem ser editadas depois de aplicadas. A próxima etapa é retirar esses helpers com análise de consumidores, revisar contratos de configuração e atualizar a documentação operacional antiga antes de criar a migration de schema ativo exclusivamente Baileys.
