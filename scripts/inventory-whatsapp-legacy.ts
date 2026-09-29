import { Pool } from "pg";

type QueryResultRow = Record<string, unknown>;

function readWorkspaceFilter() {
  const argument = process.argv.find(value => value.startsWith("--workspace="));
  if (!argument) return undefined;
  const workspaceId = Number(argument.slice("--workspace=".length));
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new Error("--workspace deve ser um inteiro positivo");
  }
  return workspaceId;
}

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

const workspaceId = readWorkspaceFilter();
const jsonOutput = process.argv.includes("--json");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL PostgreSQL não configurada; nenhuma consulta foi executada.");
  process.exit(2);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const client = await pool.connect();
  try {
    // Keep the complete report inside a read-only transaction. No mutation is
    // possible even if a future query is accidentally changed to a write.
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const params = [workspaceId ?? null];
    const workspaceFilter = `($1::integer IS NULL OR w.id = $1)`;
    const contactWorkspaceFilter = `($1::integer IS NULL OR c."workspaceId" = $1)`;

    const workspaces = await client.query<QueryResultRow>(
      `SELECT w.id, w.name, w.slug, w.status, w.active
         FROM "workspaces" w
        WHERE ${workspaceFilter}
        ORDER BY w.id`,
      params
    );

    const channelProviders = await client.query<QueryResultRow>(
      `SELECT w.id AS "workspaceId", w.name AS "workspaceName",
              ch.provider::text AS provider, COUNT(*)::integer AS count
         FROM "whatsappChannels" ch
         JOIN "workspaces" w ON w.id = ch."workspaceId"
        WHERE ${workspaceFilter}
        GROUP BY w.id, w.name, ch.provider
        ORDER BY w.id, provider`,
      params
    );

    const instanceProviders = await client.query<QueryResultRow>(
      `SELECT w.id AS "workspaceId", w.name AS "workspaceName",
              wi.provider::text AS provider, COUNT(*)::integer AS count,
              COUNT(*) FILTER (WHERE wi.active = 1)::integer AS "activeCount",
              COUNT(*) FILTER (WHERE wi."isDefault" = 1)::integer AS "defaultCount"
         FROM "whatsappInstances" wi
         JOIN "workspaces" w ON w.id = wi."workspaceId"
        WHERE ${workspaceFilter}
        GROUP BY w.id, w.name, wi.provider
        ORDER BY w.id, provider`,
      params
    );

    const instances = await client.query<QueryResultRow>(
      `SELECT w.id AS "workspaceId", w.name AS "workspaceName",
              wi.id, wi."instanceId", wi.provider::text AS provider,
              wi.status, wi.active, wi."isDefault", wi."channelId",
              wi."createdAt", wi."updatedAt"
         FROM "whatsappInstances" wi
         JOIN "workspaces" w ON w.id = wi."workspaceId"
        WHERE ${workspaceFilter}
        ORDER BY w.id, wi.id`,
      params
    );

    const messageProviders = await client.query<QueryResultRow>(
      `SELECT c."workspaceId", w.name AS "workspaceName",
              m.provider::text AS provider, m.direction, m.status,
              COUNT(*)::integer AS count,
              COUNT(*) FILTER (WHERE m.status IN ('queued', 'processing'))::integer
                AS "pendingCount",
              COUNT(*) FILTER (WHERE m.direction = 'outbound')::integer
                AS "outboundCount"
         FROM "messages" m
         JOIN "conversations" cv ON cv.id = m."conversationId"
         JOIN "contacts" c ON c.id = cv."contactId"
         JOIN "workspaces" w ON w.id = c."workspaceId"
        WHERE ${contactWorkspaceFilter}
        GROUP BY c."workspaceId", w.name, m.provider, m.direction, m.status
        ORDER BY c."workspaceId", provider, m.direction, m.status`,
      params
    );

    const pendingMessages = await client.query<QueryResultRow>(
      `SELECT c."workspaceId", w.name AS "workspaceName",
              m.provider::text AS provider, m.status, m.direction,
              COUNT(*)::integer AS count,
              COUNT(*) FILTER (WHERE m.metadata ? 'instanceId')::integer
                AS "withInstanceId",
              COUNT(*) FILTER (WHERE NOT (m.metadata ? 'instanceId'))::integer
                AS "withoutInstanceId"
         FROM "messages" m
         JOIN "conversations" cv ON cv.id = m."conversationId"
         JOIN "contacts" c ON c.id = cv."contactId"
         JOIN "workspaces" w ON w.id = c."workspaceId"
        WHERE ${contactWorkspaceFilter}
          AND m.status IN ('queued', 'processing')
        GROUP BY c."workspaceId", w.name, m.provider, m.status, m.direction
        ORDER BY c."workspaceId", provider, m.status, m.direction`,
      params
    );

    const settings = await client.query<QueryResultRow>(
      `SELECT ws."workspaceId", w.name AS "workspaceName", ws.key,
              COUNT(*)::integer AS count
         FROM "workspaceSettings" ws
         JOIN "workspaces" w ON w.id = ws."workspaceId"
        WHERE ${workspaceFilter}
          AND (
            lower(ws.key) LIKE '%papi%'
            OR lower(ws.key) LIKE '%meta%'
            OR lower(ws.key) LIKE '%provider%'
            OR lower(ws.key) LIKE '%webhook%'
          )
        GROUP BY ws."workspaceId", w.name, ws.key
        ORDER BY ws."workspaceId", ws.key`,
      params
    );

    const duplicateInstanceIds = await client.query<QueryResultRow>(
      `SELECT wi."instanceId", COUNT(DISTINCT wi."workspaceId")::integer
                AS "workspaceCount",
              ARRAY_AGG(DISTINCT wi."workspaceId" ORDER BY wi."workspaceId")
                AS "workspaceIds"
         FROM "whatsappInstances" wi
         JOIN "workspaces" w ON w.id = wi."workspaceId"
        WHERE ${workspaceFilter}
        GROUP BY wi."instanceId"
       HAVING COUNT(DISTINCT wi."workspaceId") > 1
        ORDER BY wi."instanceId"`,
      params
    );

    const report = {
      readOnly: true,
      generatedAt: new Date().toISOString(),
      workspaceId: workspaceId ?? null,
      scope: workspaceId ? `workspace=${workspaceId}` : "all workspaces",
      warning:
        "Relatório somente leitura. Nenhum valor de secret, conteúdo de mensagem ou alteração foi retornado/executado.",
      workspaces: workspaces.rows,
      channelProviders: channelProviders.rows,
      instanceProviders: instanceProviders.rows,
      instances: instances.rows,
      messageProviders: messageProviders.rows,
      pendingMessages: pendingMessages.rows,
      legacySettings: settings.rows,
      duplicateInstanceIds: duplicateInstanceIds.rows,
      totals: {
        workspaces: workspaces.rowCount ?? workspaces.rows.length,
        instances: instances.rowCount ?? instances.rows.length,
        pendingMessages: pendingMessages.rows.reduce(
          (total, row) => total + asNumber(row.count),
          0
        ),
        legacySettingRows: settings.rows.reduce(
          (total, row) => total + asNumber(row.count),
          0
        ),
        duplicateInstanceIds: duplicateInstanceIds.rowCount ?? duplicateInstanceIds.rows.length,
      },
      nextAction:
        "Salvar este JSON como evidência; revisar provider, instanceId e mensagens pendentes antes de qualquer migration ou limpeza.",
    };

    await client.query("ROLLBACK");

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("Inventário WhatsApp somente leitura");
      console.log(`Escopo: ${report.scope}`);
      console.log(`Workspaces: ${report.totals.workspaces}`);
      console.log(`Instâncias: ${report.totals.instances}`);
      console.log(`Mensagens queued/processing: ${report.totals.pendingMessages}`);
      console.log(`Settings potencialmente legados: ${report.totals.legacySettingRows}`);
      console.log(`IDs de instância duplicados entre workspaces: ${report.totals.duplicateInstanceIds}`);
      console.log(report.nextAction);
      console.log("Use --json para obter o relatório completo sem valores sensíveis.");
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
