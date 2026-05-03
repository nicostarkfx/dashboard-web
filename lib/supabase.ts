import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMockClient } from "./mockClient";

/**
 * MOCK MODE switch.
 *
 * When NEXT_PUBLIC_MOCK === "true" both `browserClient()` and
 * `serverClient()` return an in-memory fake (lib/mockClient.ts) that
 * implements just enough of the Supabase JS surface for this app.
 * Real-mode code below is left exactly as it was.
 */
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

/**
 * Read & validate Supabase env vars on demand.
 *
 * Replaces the old module-level `assertEnv()` whose
 * `asserts supabaseUrl is string` clause referenced a closure binding —
 * invalid under strict TS (TS1225) and broke `next build` on Vercel.
 *
 * In MOCK mode this function is never called, so the Supabase env vars
 * do not need to be defined.
 *
 * Trim defends against trailing whitespace/newlines pasted into .env.local.
 */
function readSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. " +
      "Restart `next dev` after editing."
    );
  }
  return { url, key };
}

/** Force every PostgREST call to bypass Next.js's server fetch cache. */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...(init ?? {}), cache: "no-store" });

/** Shared options — identical between client and server. */
const baseOptions = {
  auth: {
    persistSession:     false,
    autoRefreshToken:   false,
    detectSessionInUrl: false,
  },
  db: { schema: "public" as const },
  global: { fetch: noStoreFetch },
};

/** Browser-side client. */
export function browserClient(): SupabaseClient {
  if (MOCK_MODE) return getMockClient() as unknown as SupabaseClient;
  const { url, key } = readSupabaseEnv();
  return createClient(url, key, baseOptions);
}

/** Server-side client (Server Components, Route Handlers, Server Actions). */
export function serverClient(): SupabaseClient {
  if (MOCK_MODE) return getMockClient() as unknown as SupabaseClient;
  const { url, key } = readSupabaseEnv();
  return createClient(url, key, baseOptions);
}
