'use client';

import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient(url?: string, anonKey?: string) {
  if (!url || !anonKey) throw new Error('Supabase 登录尚未配置。');
  if (!client) client = createBrowserClient(url, anonKey);
  return client;
}
