/**
 * Server-side Supabase auth helper.
 *
 * Uses @supabase/ssr's createServerClient bound to Next's cookie store
 * so server components and route handlers can identify the caller.
 * Separate from `lib/supabase.ts`'s `serverClient()`, which is the
 * data-layer client (anon key, no cookie binding).
 */
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

type CookieSpec = { name: string; value: string; options: CookieOptions };

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabaseServer] Missing NEXT_PUBLIC_SUPABASE_URL or " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: CookieSpec[]) {
        try {
          toSet.forEach(({ name, value, options }: CookieSpec) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server components can't write cookies; middleware already
          // refreshes the session, so it's safe to ignore here.
        }
      },
    },
  });
}

/**
 * Returns the authenticated user. Throws if no session — protected
 * routes are middleware-gated, so reaching here without a user means
 * something upstream is misconfigured.
 */
export async function getServerUser(): Promise<User> {
  const supabase = authClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("[auth] no authenticated user");
  return user;
}
