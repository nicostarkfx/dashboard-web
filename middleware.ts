/**
 * Auth middleware — runs on every request matching `config.matcher`.
 *
 * Two responsibilities:
 *   1) Refresh the Supabase auth tokens (cookies). Tokens expire ~1h,
 *      and middleware is the recommended place to keep them current
 *      so server components don't see stale sessions.
 *   2) Gate protected routes (/dashboard, /account/*). If no user,
 *      redirect to "/".
 *
 * Standard @supabase/ssr pattern — see Supabase Next.js auth docs.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieSpec = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Without creds we can't validate sessions — let the request through
    // rather than locking everyone out.
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieSpec[]) {
        cookiesToSet.forEach(({ name, value }: CookieSpec) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }: CookieSpec) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Triggers a token refresh if needed and tells us if a user is signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = new URL("/", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

/**
 * Only run middleware on protected routes. Auth screen ("/"), API routes
 * and Next internals are excluded so anonymous users can still reach the
 * login page and static assets stay fast.
 */
export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*"],
};
