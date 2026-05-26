import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRate } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  source: z.string().min(1).max(120),
  message: z.string().min(1).max(1000),
  stack: z.string().max(6000).optional(),
  digest: z.string().max(200).optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(request: Request) {
  const limit = await checkRate({
    scope: "client-events",
    windowMs: 60 * 60 * 1000,
    max: 120,
  });
  if (!limit.ok) {
    return NextResponse.json({ ok: true });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.error("[client-error]", parsed.data);
  return NextResponse.json({ ok: true });
}
