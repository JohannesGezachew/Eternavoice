import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/", "/auth", "/privacy", "/terms", "/auth/login", "/auth/callback"];
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

  // API routes: return 401 if not authenticated
  if (pathname.startsWith("/api/")) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return response;
  }

  // App routes: redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check subscription status for app routes (not account/subscribe pages)
  // Skipped when SKIP_SUBSCRIPTION_CHECK=true (local dev / pre-Stripe setup)
  const BILLING_EXEMPT = ["/subscribe", "/account", "/auth"];
  const skipBilling = process.env.SKIP_SUBSCRIPTION_CHECK === "true";
  if (!skipBilling && !BILLING_EXEMPT.some((p) => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, trial_ends_at")
      .eq("id", user.id)
      .single();

    const status = profile?.subscription_status;
    // Trials created in-app carry trial_ends_at; trials managed by Stripe
    // (legacy checkouts) have it null and expire via webhook status changes.
    const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at as string) : null;
    const inTrial = status === "trialing" && (!trialEndsAt || trialEndsAt.getTime() > Date.now());
    const hasAccess = status === "active" || inTrial;

    if (!hasAccess) {
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
