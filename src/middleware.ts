import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasAccess, isBillingExempt } from "@/lib/entitlement";

const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/privacy",
  "/terms",
  "/about",
  "/auth/login",
  "/auth/callback",
  // Crawler files must be reachable anonymously, or they redirect to login
  // and search engines see a sign-in page instead of the sitemap.
  "/robots.txt",
  "/sitemap.xml",
];
// "/icons/" matters: site.webmanifest points at /icons/icon-192.png, and
// without it the manifest icons redirect to the login page — so an installed
// PWA, and every crawler reading the manifest, gets an HTML sign-in page where
// it asked for a PNG.
const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/icons/", "/favicon", "/opengraph", "/site.web", "/apple", "/safari", "/android", "/browserconfig"];
const API_PATHS_SKIP_AUTH = ["/api/stripe/webhook"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

/**
 * The one public path whose rendering depends on who is asking: an already
 * signed-in visitor is sent to /voices rather than shown a login form.
 *
 * Everything else public — the landing page, the legal pages, the manifest
 * icons — reads identically signed in or out, so resolving the user for them
 * was a full auth round trip spent on an answer nobody used.
 */
function needsUserWhenPublic(pathname: string): boolean {
  return pathname === "/auth/login";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Stripe webhooks must not be intercepted
  if (API_PATHS_SKIP_AUTH.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Public and indifferent to identity: answer without touching the network.
  //
  // supabase.auth.getUser() is a round trip to the auth server on every single
  // request that reaches here, and this used to run before the public check —
  // so every icon, every crawler file, and every marketing page paid for a
  // lookup that was then discarded two lines later. The cost of skipping it is
  // that a session sitting on a public page is not refreshed in the
  // background; the next app request refreshes it instead.
  if (isPublic(pathname) && !needsUserWhenPublic(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public routes: allow through
  if (isPublic(pathname)) {
    // If already logged in and visiting login, redirect to voices
    if (user && pathname === "/auth/login") {
      return NextResponse.redirect(new URL("/voices", request.url));
    }
    return response;
  }

  const isApi = pathname.startsWith("/api/");

  // Unauthenticated: 401 for the API, login redirect for pages.
  if (!user) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Entitlement. This MUST cover /api/* as well as pages: the client talks to
  // /api/chat, /api/tts and /api/clone directly, so gating only navigations
  // left every paid endpoint usable indefinitely after a trial lapsed.
  //
  // Skipped when SKIP_SUBSCRIPTION_CHECK=true (local dev / pre-Stripe setup).
  // The exempt list and the access rule both live in @/lib/entitlement, so the
  // account and subscribe screens can describe exactly what this gate enforces.
  const skipBilling = process.env.SKIP_SUBSCRIPTION_CHECK === "true";
  if (!skipBilling && !isBillingExempt(pathname)) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("subscription_status, trial_ends_at")
      .eq("id", user.id)
      .single();

    // Distinguish "no access" from "couldn't tell". A Supabase blip must not
    // dump every paying customer onto the payment page.
    if (error) {
      console.error("[middleware] entitlement read failed:", error.message);
      return response;
    }

    if (
      !hasAccess(
        profile?.subscription_status as string | undefined,
        profile?.trial_ends_at as string | null,
      )
    ) {
      // 402 lets the client route to /subscribe itself; a redirect would be
      // parsed as a malformed API response.
      if (isApi) {
        return NextResponse.json(
          { error: "subscription_required" },
          { status: 402 },
        );
      }
      return NextResponse.redirect(new URL("/subscribe", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Kept in step with PUBLIC_PREFIXES above: anything listed there is
    // returned untouched anyway, so invoking middleware for it only costs a
    // function call on the edge. Widened from `_next/static|_next/image` to
    // all of `_next/`, and extended to the icon set, the manifest and the
    // crawler files — the PWA alone requests six of those on a cold start.
    "/((?!_next/|icons/|favicon|opengraph|site\\.web|apple|safari|android|browserconfig|mstile|robots\\.txt|sitemap\\.xml).*)",
  ],
};
