import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/favicon", "/opengraph", "/site.web", "/apple", "/safari", "/android", "/browserconfig"];
const API_PATHS_SKIP_AUTH = ["/api/stripe/webhook"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Stripe webhooks must not be intercepted
  if (API_PATHS_SKIP_AUTH.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
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
  const BILLING_EXEMPT = [
    "/subscribe",
    "/account",
    "/auth",
    // Billing itself must stay reachable so a lapsed user can pay.
    "/api/stripe",
    // Data rights survive cancellation, and the usage read powers the
    // "you've reached this month's conversations" copy.
    "/api/user",
    "/api/usage",
  ];
  const skipBilling = process.env.SKIP_SUBSCRIPTION_CHECK === "true";
  if (!skipBilling && !BILLING_EXEMPT.some((p) => pathname.startsWith(p))) {
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

    const status = profile?.subscription_status;
    // Trials created in-app carry trial_ends_at; trials managed by Stripe
    // (legacy checkouts) have it null and expire via webhook status changes.
    const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at as string) : null;
    const inTrial = status === "trialing" && (!trialEndsAt || trialEndsAt.getTime() > Date.now());
    const hasAccess = status === "active" || inTrial;

    if (!hasAccess) {
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
    "/((?!_next/static|_next/image|favicon|opengraph|site.web|apple|safari|android|browserconfig).*)",
  ],
};
