import { createHash } from 'node:crypto';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
}

export function createIdempotencyKey(input: {
  executionId: string;
  operation: string;
  path: string;
  body?: unknown;
  suppliedKey?: string;
}): string {
  const supplied = input.suppliedKey?.trim();
  if (supplied && supplied.length >= 8 && supplied.length <= 180) return supplied;

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(stableValue({ operation: input.operation, path: input.path, body: input.body ?? null })))
    .digest('hex')
    .slice(0, 48);
  const executionId = (input.executionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'unknown';
  return `n8n-${executionId}-${fingerprint}`;
}
