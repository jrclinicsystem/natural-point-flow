import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL =
  env["VITE_SUPABASE_URL"] ?? "https://yytrbisflzsnrvzdcekj.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  env["VITE_SUPABASE_ANON_KEY"] ??
  "sb_publishable_U6XeK9BQbkDhj1Qs3beEmQ_u7NEvSeA";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "natural-point-auth",
    },
  },
);
