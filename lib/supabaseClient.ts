/**
 * Browser-side Supabase client for AUTH (singleton).
 *
 * This is intentionally separate from `lib/supabase.ts`:
 *   - `lib/supabase.ts`        → DATA layer (PostgREST queries) with a
 *                                MOCK_MODE branch for dev. Returns a fresh
 *                                client per call, no session persistence.
 *   - `lib/supabaseClient.ts`  → AUTH layer. Uses @supabase/ssr's
 *                                createBrowserClient so tokens land in
 *                                HttpOnly cookies (readable by middleware
 *                                + server components for route gating).
 *
 * Always real Supabase — auth is wired against the live project even when
 * NEXT_PUBLIC_MOCK is on, so the data layer can stay mocked in dev while
 * login/signup/logout exercise the real auth backend.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "[supabaseClient] Missing NEXT_PUBLIC_SUPABASE_URL or " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY. Auth requires real credentials.",
    );
  }

  _client = createBrowserClient(url, key);
  return _client;
}
