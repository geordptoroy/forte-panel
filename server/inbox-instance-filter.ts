export class InboxInstanceFilterError extends Error {
  constructor(readonly reason: "empty" | "unavailable") {
    super(
      reason === "empty"
        ? "Selecione uma instância ou escolha Todas"
        : "Uma ou mais instâncias não estão disponíveis neste workspace"
    );
    this.name = "InboxInstanceFilterError";
  }
}

/** null/undefined explicitly mean Todas; selected IDs must all be workspace-owned. */
export function normalizeInboxInstanceSelection(
  requested: readonly string[] | null | undefined,
  available: readonly { instanceId: string }[]
): string[] | undefined {
  if (requested == null) return undefined;
  if (requested.length === 0) throw new InboxInstanceFilterError("empty");
  const trimmed = requested.map(id => id.trim());
  if (trimmed.some(id => !id))
    throw new InboxInstanceFilterError("unavailable");
  const selected = Array.from(new Set(trimmed));
  if (
    selected.length === 0 ||
    selected.some(id => !available.some(instance => instance.instanceId === id))
  )
    throw new InboxInstanceFilterError("unavailable");
  return selected;
}
