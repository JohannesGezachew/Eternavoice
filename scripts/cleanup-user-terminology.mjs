/**
 * One-time cleanup: rewrite already-stored auto-extracted memories and session
 * summaries so they no longer refer to the living person as "the user" (or to
 * the recreated voice as "the persona"). New extractions are already fixed in
 * the summariser prompt; this backfills the rows written before that change.
 *
 * Safe by default: prints a dry-run diff and writes nothing. Pass --apply to
 * re-encrypt and persist the rewrites.
 *
 *   node scripts/cleanup-user-terminology.mjs            # dry run
 *   node scripts/cleanup-user-terminology.mjs --apply    # write changes
 *
 * Reads MASTER_ENCRYPTION_KEY, SUPABASE_SERVICE_ROLE_KEY and
 * NEXT_PUBLIC_SUPABASE_URL from .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";
import fs from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

// ── env ────────────────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const master = Buffer.from(env.MASTER_ENCRYPTION_KEY, "base64");
if (master.byteLength !== 32) throw new Error("MASTER_ENCRYPTION_KEY must be 32 bytes base64");

// ── crypto (mirrors src/lib/crypto.ts) ──────────────────────────────────────
const keyFor = (uid) => createHmac("sha256", master).update(uid).digest();
function decrypt(ct, key) {
  const [iv, tag, data] = ct.split(":").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return d.update(data) + d.final("utf8");
}
function encrypt(text, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

// ── rewrite ──────────────────────────────────────────────────────────────────
// Phrasing was produced by one consistent prompt example, so a small ordered
// set of replacements covers it. Possessives first (they'd otherwise be eaten
// by the bare-noun rules). Verb-agreement after "You/I" is left as-is — these
// are recall notes the persona reads, not user-facing copy; the dry run lets
// you eyeball anything awkward before applying.
const RULES = [
  [/\bThe user's\b/g, "Your"],
  [/\bthe user's\b/g, "your"],
  [/\bThe persona's\b/g, "My"],
  [/\bthe persona's\b/g, "my"],
  [/\bThe user\b/g, "You"],
  [/\bthe user\b/g, "you"],
  [/\bThe persona\b/g, "I"],
  [/\bthe persona\b/g, "I"],
];
const NEEDS = /\bthe user\b|\bthe persona\b/i;
function rewrite(text) {
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}

// ── run ──────────────────────────────────────────────────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function process_(table, encCol) {
  const { data, error } = await sb.from(table).select(`id, user_id, ${encCol}`);
  if (error) throw new Error(`${table}: ${error.message}`);
  let total = 0, changed = 0, failed = 0;
  for (const row of data ?? []) {
    total++;
    const key = keyFor(row.user_id);
    let before;
    try { before = decrypt(row[encCol], key); } catch { failed++; continue; }
    if (!NEEDS.test(before)) continue;
    const after = rewrite(before);
    if (after === before) continue;
    changed++;
    console.log(`\n[${table} ${row.id}]`);
    console.log(`  - ${before}`);
    console.log(`  + ${after}`);
    if (APPLY) {
      const { error: upErr } = await sb
        .from(table)
        .update({ [encCol]: encrypt(after, key) })
        .eq("id", row.id);
      if (upErr) { console.log(`  ! write failed: ${upErr.message}`); failed++; }
    }
  }
  return { total, changed, failed };
}

console.log(APPLY ? "=== APPLYING CHANGES ===" : "=== DRY RUN (no writes) — pass --apply to persist ===");
const mem = await process_("memories", "content_enc");
const sum = await process_("session_summaries", "summary_enc");
console.log("\n--- summary ---");
console.log(`memories:          ${mem.changed} to rewrite / ${mem.total} total` + (mem.failed ? ` (${mem.failed} undecryptable/failed)` : ""));
console.log(`session_summaries: ${sum.changed} to rewrite / ${sum.total} total` + (sum.failed ? ` (${sum.failed} undecryptable/failed)` : ""));
console.log(APPLY ? "\nDone — changes written." : "\nDry run only. Re-run with --apply once the diff looks right.");
