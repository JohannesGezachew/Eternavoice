/**
 * One-time backfill: rewrite stored memories and session summaries that talk
 * about the living person in the third person, by name.
 *
 * The summariser used to be told to write from the Persona's point of view but
 * was never told who it was writing about — so it picked the speaker's name out
 * of the transcript and produced "Safa mentioned a topic called
 * 'Beachtungsplan'". The Persona then reads that back as a note about a
 * stranger. The prompt now names the speaker explicitly and forbids it; this
 * fixes what was written before.
 *
 * Also merges exact duplicates, which the old summariser produced freely (the
 * same account had "The user's name is Safa." stored twice, weeks apart).
 *
 * Safe by default: prints a dry-run diff and writes nothing. Pass --apply to
 * re-encrypt and persist.
 *
 *   node scripts/rewrite-memory-voice.mjs            # dry run
 *   node scripts/rewrite-memory-voice.mjs --apply    # write changes
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── rewrite ─────────────────────────────────────────────────────────────────
// Deliberately conservative: only the speaker's own name is rewritten, and only
// where it is the subject of a sentence. Names inside a memory that are ABOUT
// someone else ("You are with someone named Jonas") must survive untouched —
// mangling those would destroy the very thing the persona is meant to recall.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rulesFor(name) {
  const n = esc(name);
  return [
    // Possessives first, or the bare-name rules eat them.
    [new RegExp(`\\b${n}'s\\b`, "g"), "your"],
    [new RegExp(`\\b${n}’s\\b`, "g"), "your"],
    // "with Safa", "to Safa", "for Safa" → "with you"
    [new RegExp(`\\b(with|to|for|about|from|told|asked|gave|and)\\s+${n}\\b`, "gi"), "$1 you"],
    // Sentence-initial subject: "Safa mentioned…" → "You mentioned…"
    [new RegExp(`(^|[.!?]\\s+)${n}\\b`, "g"), "$1You"],
    // Anything left over mid-sentence.
    [new RegExp(`\\b${n}\\b`, "g"), "you"],
  ];
}

// "Your name is Safa" is the one place the name genuinely belongs — it is the
// fact itself. Skip any memory that is only stating it.
const IS_NAME_FACT = /\b(your|the user's)\s+name\s+is\b/i;

function rewrite(text, name) {
  if (IS_NAME_FACT.test(text)) {
    // Still normalise the old "The user's name is X" phrasing.
    return text.replace(/\bThe user's\b/g, "Your").replace(/\bthe user's\b/g, "your");
  }
  let out = text;
  for (const [re, to] of rulesFor(name)) out = out.replace(re, to);
  // A possessive at the start of a sentence lands as lowercase "your" — the
  // rules can't tell position from a bare match, so restore the capital here.
  if (/^[A-Z]/.test(text) && /^[a-z]/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  // Tidy the agreement the naive substitution leaves behind.
  return out
    .replace(/\byou is\b/g, "you are")
    .replace(/\byou has\b/g, "you have")
    .replace(/\byou was\b/g, "you were")
    .replace(/\byou mentions\b/g, "you mention")
    .replace(/\bYou is\b/g, "You are")
    .replace(/\bYou has\b/g, "You have")
    .replace(/\bYou was\b/g, "You were")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("id, display_name");
  if (pErr) throw new Error(`profiles: ${pErr.message}`);

  const named = (profiles ?? []).filter((p) => (p.display_name ?? "").trim());
  if (!named.length) {
    console.log(
      "No profiles have display_name set. Set your name on the account page first —\n" +
        "the script needs to know which name to rewrite, and guessing it from\n" +
        "memory text is exactly the mistake being corrected.",
    );
    return;
  }

  let scanned = 0, rewritten = 0, merged = 0, failed = 0;

  for (const profile of named) {
    const name = profile.display_name.trim();
    const key = keyFor(profile.id);

    for (const [table, col] of [
      ["memories", "content_enc"],
      ["session_summaries", "summary_enc"],
    ]) {
      const { data, error } = await sb
        .from(table)
        .select(`id, ${col}, created_at`)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`${table}: ${error.message}`);

      const seen = new Map(); // normalised text -> row id we are keeping
      for (const row of data ?? []) {
        scanned++;
        let plain;
        try {
          plain = decrypt(row[col], key);
        } catch {
          failed++;
          continue;
        }

        const next = rewrite(plain, name);
        const norm = next.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();

        // Exact duplicate of one we have already kept — drop it.
        if (table === "memories" && seen.has(norm)) {
          merged++;
          console.log(`  merge  ${row.id}  ${next.slice(0, 70)}`);
          if (APPLY) {
            await sb
              .from(table)
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", row.id);
          }
          continue;
        }
        seen.set(norm, row.id);

        if (next === plain) continue;
        rewritten++;
        console.log(`  ${plain.slice(0, 64)}\n     -> ${next.slice(0, 64)}`);
        if (APPLY) {
          const { error: uErr } = await sb
            .from(table)
            .update({ [col]: encrypt(next, key) })
            .eq("id", row.id);
          if (uErr) {
            failed++;
            console.error(`  ! ${row.id}: ${uErr.message}`);
          }
        }
      }
    }
  }

  console.log(
    `\n${APPLY ? "applied" : "dry run"} — scanned ${scanned}, rewritten ${rewritten}, ` +
      `merged ${merged}, unreadable ${failed}`,
  );
  if (!APPLY && (rewritten || merged)) {
    console.log("Re-run with --apply to write these changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
