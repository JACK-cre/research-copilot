import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getSupabasePublicConfig } from '@/lib/platform-config';

let adminClient: ReturnType<typeof createClient> | undefined;

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;
  const { url } = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
