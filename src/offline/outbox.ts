import { newId, type OutboxEntry } from './db';

/** A new waiting change. Always saved in the same transaction as the record it changes. */
export function outboxEntry(type: OutboxEntry['type'], entityId: string, payload: OutboxEntry['payload']): OutboxEntry {
  return {
    mutationId: newId(),
    type,
    entityId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
}

export function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
