import { Pool } from "pg";
import { groupContactDuplicates, type ContactAuditRow } from "../server/_core/contact-duplicates";

function readWorkspaceFilter() {
  const argument = process.argv.find(value => value.startsWith("--workspace="));
  if (!argument) return undefined;
  const workspaceId = Number(argument.slice("--workspace=".length));
  if (!Number.isInteger(workspaceId) || workspaceId <= 0)
    throw new Error("--workspace deve ser um inteiro positivo");
  return workspaceId;
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
  const result = await pool.query<ContactAuditRow>(
    `SELECT id, "workspaceId", "externalPhone", name, "createdAt", "updatedAt"
       FROM "contacts"
      WHERE ($1::integer IS NULL OR "workspaceId" = $1)
      ORDER BY "workspaceId" NULLS FIRST, id`,
    [workspaceId ?? null]
  );
  const groups = groupContactDuplicates(result.rows);
  const report = {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    workspaceId: workspaceId ?? null,
    scannedContacts: result.rowCount ?? result.rows.length,
    duplicateGroupCount: groups.length,
    duplicateContactCount: groups.reduce((total, group) => total + group.contacts.length, 0),
    groups,
    nextAction: groups.length
      ? "Revisar cada grupo em staging; este comando não altera, mescla ou exclui dados."
      : "Nenhuma duplicidade equivalente encontrada no escopo consultado.",
  };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Auditoria somente leitura: ${report.scannedContacts} contatos verificados.`);
    console.log(`Grupos duplicados: ${report.duplicateGroupCount}. Contatos envolvidos: ${report.duplicateContactCount}.`);
    for (const group of groups) {
      console.log(`- workspace=${group.workspaceId ?? "NULL"} canonical=${group.canonicalPhone}`);
      for (const contact of group.contacts)
        console.log(`  #${contact.id} ${contact.externalPhone} — ${contact.name}`);
    }
    console.log(report.nextAction);
  }
} finally {
  await pool.end();
}
