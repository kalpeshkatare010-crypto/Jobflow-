import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthExpiredError, type MutationResult, type PullResponse, type SyncApi } from './engine';

function isAuthError(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST301' || error.code === 'PGRST303' || /jwt/i.test(error.message ?? '');
}

/** Calls the sync_push / sync_pull database functions with the person's own session. */
export function createSupabaseSyncApi(client: SupabaseClient): SyncApi {
  return {
    async push(tenantId, mutations) {
      const { data, error } = await client.rpc('sync_push', { p_tenant: tenantId, p_mutations: mutations });
      if (isAuthError(error)) throw new AuthExpiredError();
      if (error) throw new Error(error.message);
      return data as MutationResult[];
    },
    async pull(tenantId, cursor) {
      const { data, error } = await client.rpc('sync_pull', { p_tenant: tenantId, p_cursor: cursor });
      if (isAuthError(error)) throw new AuthExpiredError();
      if (error) throw new Error(error.message);
      return data as PullResponse;
    },
  };
}
