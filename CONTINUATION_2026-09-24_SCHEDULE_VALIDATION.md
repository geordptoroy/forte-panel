# Forte Panel — Validação de jornada e conflitos de agenda

**Data:** 24/09/2026  
**Repositório:** `geordptoroy/forte-panel`  
**Branch:** `main`

## Objetivo

Fechar a lacuna operacional que permitia criar agendamentos em horários fora da jornada cadastrada e sobrepor reservas do mesmo profissional. Aplicar a regra da mesma forma nas entradas tRPC e na API REST, incluindo reagendamento, com interpretação de horário no fuso do workspace.

## Implementação

`server/schedule.ts` concentra regras puras de período, janela semanal, fuso horário e comparação de intervalos. A verificação converte os instantes para a data e hora civil de `workspace.timezone` antes de comparar com `weekday`, `startMinute` e `endMinute`. Um horário precisa caber integralmente em uma única janela do dia. Jornada não configurada e horário fora de jornada são recusados; período com final anterior/igual ao início também é inválido. O schema atual não representa turnos noturnos, então intervalos que atravessam a meia-noite são intencionalmente recusados.

`createAgendaAppointment()` e `rescheduleAgendaAppointment()` agora executam validação e gravação em transação PostgreSQL. Ambos bloqueiam a linha do profissional com `SELECT ... FOR UPDATE`, consultam a jornada ativa, e procuram qualquer agendamento do mesmo profissional cujo intervalo se interseccione, exceto estados `cancelled`. Isso inclui reservas `requested`, não apenas confirmadas. A comparação é semiaberta: compromissos adjacentes (um termina exatamente quando o próximo começa) são aceitos. Edições de jornada usam o mesmo lock por profissional para não competir com uma reserva em curso.

O lock serializa duas reservas concorrentes, evitando a janela de corrida entre uma consulta de conflito e o `INSERT`. Se duas chamadas tentarem reservar o mesmo horário simultaneamente, uma é salva e a outra recebe conflito.

`server/routers.ts` converte as falhas de domínio para códigos tRPC (`CONFLICT`, `BAD_REQUEST` e `NOT_FOUND`). `server/api.ts` retorna códigos HTTP/JSON específicos: `400 invalid_period` e `409 professional_unavailable`, `schedule_not_configured`, `outside_working_hours` ou `appointment_conflict`. Os handlers REST agora aguardam a promessa de idempotência dentro do `try/catch`, capturando erros assíncronos sem encerrar o processo.

`GET /api/v1/availability` inclui em cada profissional o array `weeklyAvailability`, com os dias no padrão `0=domingo ... 6=sábado` e minutos desde a meia-noite no fuso do workspace. Isso dá ao consumidor as janelas e os compromissos existentes para montar opções, enquanto o servidor continua revalidando cada tentativa de reserva.

## Verificação

| Verificação | Resultado |
|---|---|
| `pnpm check` | Sem erros |
| `pnpm test` com PostgreSQL 16 | 30 testes aprovados, 8 arquivos |
| Teste de integração de conflito concorrente | Uma reserva aprovada e uma recusada |
| `pnpm build` | Sucesso; aviso conhecido de bundle frontend acima de 500 kB |
| `scripts/validate-flow.mjs` contra servidor real | 29 de 29 verificações aprovadas |
| Healthcheck após uma reserva recusada | `200 OK`; o servidor continua respondendo |

O conjunto cobre fuso de São Paulo, faixa permitida, limite de fechamento, dia da semana, ausência de jornada, cruzamento de meia-noite, intervalos adjacentes, reservas conflitantes em estado `requested`, concorrência real no PostgreSQL, criação tRPC/REST, reagendamento e a exposição da jornada na API.

## Processo longo identificado

A checagem solicitada de um processo “rodando há 30+ minutos” encontrou `job_j3080rNk`, iniciado no trabalho anterior. Apesar de parecer um subagente, era um **servidor de teste residente** (`pnpm start`), não um agent. Ele foi inspecionado, encerrado após os testes e substituído temporariamente por uma instância com o código atualizado. Essa instância temporária também foi encerrada ao concluir a validação.

Durante os testes, a primeira execução REST revelou que retornar diretamente a promessa de `idempotent()` dentro de um `try/catch` não capturava rejeições assíncronas no handler. A rota foi corrigida para `return await idempotent(...)`; uma nova execução confirmou a resposta `409` e o healthcheck `200` logo depois.

## Próximos passos

A prioridade seguinte é ligar as preferências de notificação persistidas a canais de envio e eventos do domínio. O agendamento já publica `appointment.created`, `appointment.confirmed` e `appointment.cancelled` no outbox, mas ainda falta decidir/configurar os canais e os templates de aviso. O compose local completo também ainda precisa ser exercitado numa máquina com Docker.

## Como validar novamente

```bash
pnpm check
DATABASE_URL=postgresql://... pnpm test
pnpm build
FORTE_API_KEY=<chave> node scripts/validate-flow.mjs http://localhost:3000
```

O teste de concorrência da suíte de isolamento é executado quando `DATABASE_URL` aponta para PostgreSQL e é ignorado sem banco.
