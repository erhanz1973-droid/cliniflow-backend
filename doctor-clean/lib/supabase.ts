import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseAnonKey, getPublicSupabaseUrl } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Optional browser-style client (anon + RLS). Returns null if anon key unset. */
export function getSupabaseClient(): SupabaseClient | null {
  const url = getPublicSupabaseUrl();
  const key = getPublicSupabaseAnonKey();
  if (!key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}
