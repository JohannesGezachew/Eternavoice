import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function stripe() {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-05-27.dahlia" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const { origin } = new URL(request.url);
  const session = await stripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id as string,
    return_url: `${origin}/account`,
  });

  return NextResponse.json({ url: session.url });
}
