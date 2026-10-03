import {
  listIndeterminateApiIdempotency,
  reconcileIndeterminateApiIdempotency,
} from "../server/api-idempotency-reconciliation";

function flag(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.find(argument => argument.startsWith(prefix));
  return value?.slice(prefix.length);
}

function positiveInteger(name: string) {
  const value = flag(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} deve ser um inteiro positivo`);
  return parsed;
}

const action = flag("--action");
const workspaceId = positiveInteger("--workspace");
const key = flag("--key");
const reason = flag("--reason");
const jsonOutput = process.argv.includes("--json");
const confirmed = process.argv.includes("--confirm");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL PostgreSQL não configurada; nenhuma consulta foi executada.");
  process.exit(2);
}

try {
  if (action === undefined || action === "list") {
    const rows = await listIndeterminateApiIdempotency({
      ...(workspaceId === undefined ? {} : { workspaceId }),
      ...(key === undefined ? {} : { key }),
    });
    const report = {
      readOnly: true,
      count: rows.length,
      claims: rows.map(row => ({
        id: row.id,
        workspaceId: row.workspaceId,
        key: row.key,
        fingerprint: row.fingerprint,
        status: row.status,
        statusCode: row.statusCode,
        claimTokenPresent: Boolean(row.claimToken),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextAction:
        "Verificar no gateway/worker se o efeito externo ocorreu; só depois usar --action=mark-failed com --confirm e uma razão específica.",
    };
    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("Claims REST indeterminate (somente leitura)");
      console.log(`Encontradas: ${report.count}`);
      for (const claim of report.claims)
        console.log(
          `- workspace=${claim.workspaceId} key=${claim.key} fingerprint=${claim.fingerprint} updatedAt=${claim.updatedAt.toISOString()}`
        );
      console.log(report.nextAction);
    }
  } else if (action === "mark-failed") {
    if (!workspaceId || !key || !reason)
      throw new Error("--action=mark-failed exige --workspace, --key e --reason");
    if (!confirmed)
      throw new Error("--action=mark-failed exige --confirm após verificar o efeito externo");
    const updated = await reconcileIndeterminateApiIdempotency({
      workspaceId,
      key,
      reason,
    });
    const result = {
      readOnly: false,
      reconciled: true,
      workspaceId: updated.workspaceId,
      key: updated.key,
      status: updated.status,
      auditAction: "api_idempotency_reconciled",
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error("--action deve ser list ou mark-failed");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
