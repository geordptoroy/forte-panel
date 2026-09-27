import { normalizeContactPhone } from "./phone";

export type ContactAuditRow = {
  id: number;
  workspaceId: number | null;
  externalPhone: string;
  name: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type ContactDuplicateGroup = {
  workspaceId: number | null;
  canonicalPhone: string;
  contacts: ContactAuditRow[];
};

export function groupContactDuplicates(rows: ContactAuditRow[]) {
  const groups = new Map<string, ContactAuditRow[]>();
  for (const row of rows) {
    const canonicalPhone = normalizeContactPhone(row.externalPhone);
    if (!canonicalPhone) continue;
    const key = `${row.workspaceId ?? "null"}:${canonicalPhone}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.entries())
    .filter(([, contacts]) => contacts.length > 1)
    .map(([key, contacts]) => {
      const separator = key.indexOf(":");
      return {
        workspaceId: key.slice(0, separator) === "null" ? null : Number(key.slice(0, separator)),
        canonicalPhone: key.slice(separator + 1),
        contacts: contacts.sort(
          (a: ContactAuditRow, b: ContactAuditRow) => a.id - b.id
        ),
      } satisfies ContactDuplicateGroup;
    })
    .sort((a, b) =>
      `${a.workspaceId ?? "null"}:${a.canonicalPhone}`.localeCompare(
        `${b.workspaceId ?? "null"}:${b.canonicalPhone}`
      )
    );
}
