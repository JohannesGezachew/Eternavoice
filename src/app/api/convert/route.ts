import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const exec = promisify(execFile);

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  // Defence in depth: middleware already gates /api/*, but this route shells
  // out to ffmpeg with a 300s budget on caller-supplied bytes — far too costly
  // to leave protected by a single layer that a matcher change could widen.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("Unauthorized", 401);

  let tmpDir: string | null = null;

  try {
    // ── 1. Read filename from header ───────────────────────────────────────
    const rawName = req.headers.get("x-filename") ?? "input.bin";
    const filename = (() => {
      try { return decodeURIComponent(rawName); } catch { return rawName; }
    })();
    const ext = (filename.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ?? "bin").toLowerCase() || "bin";

    // ── 2. Read raw body ───────────────────────────────────────────────────
    // Reject oversized uploads before buffering them: the whole body is held
    // in lambda memory, so an unbounded read is a trivial OOM.
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return err("That file is larger than we accept (150 MB).", 413);
    }

    let bodyBuf: Buffer;
    try {
      const ab = await req.arrayBuffer();
      if (!ab.byteLength) return err("Empty file received", 400);
      if (ab.byteLength > MAX_UPLOAD_BYTES) {
        return err("That file is larger than we accept (150 MB).", 413);
      }
      bodyBuf = Buffer.from(ab);
    } catch (e) {
      console.error("[convert] body read failed:", e);
      return err("Could not read that upload.", 400);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[convert] received ${filename} (${(bodyBuf.length / 1e6).toFixed(1)} MB)`);
    }

    // ── 3. Write to temp dir ───────────────────────────────────────────────
    const id = randomBytes(8).toString("hex");
    tmpDir = join(tmpdir(), `ev-${id}`);
    await mkdir(tmpDir);

    const inputPath = join(tmpDir, `in.${ext}`);
    const outputPath = join(tmpDir, "out.mp3");

    await writeFile(inputPath, bodyBuf);

    // ── 4. Convert with ffmpeg ─────────────────────────────────────────────
    try {
      await exec(
        "/usr/bin/ffmpeg",
        [
          // Confine ffmpeg to the local file we just wrote. Without this it
          // will happily follow references inside the *content* — an HLS
          // playlist or DASH manifest naming file:///proc/self/environ turns
          // this endpoint into an env-var (i.e. API key) disclosure primitive.
          "-protocol_whitelist", "file",
          "-nostdin",
          "-i", inputPath,
          "-vn",                   // drop video
          "-acodec", "libmp3lame",
          "-b:a", "128k",
          "-ar", "22050",
          "-t", "7200",            // never transcode more than 2 hours
          "-fs", "200M",           // hard cap on output size
          "-y",
          outputPath,
        ],
        { timeout: 240_000, maxBuffer: 8 * 1024 * 1024 },
      );
    } catch (e) {
      const fe = e as { stderr?: string; message?: string };
      // Logged in full, never returned: ffmpeg's stderr echoes absolute server
      // paths, the build config, and the content of whatever it tried to open.
      console.error("[convert] ffmpeg error:\n" + (fe.stderr ?? fe.message ?? String(e)).trim());
      return err("We couldn't read that file. Try a different recording.", 422);
    }

    // ── 5. Read and return MP3 ─────────────────────────────────────────────
    let mp3: Buffer;
    try {
      mp3 = await readFile(outputPath);
    } catch (e) {
      console.error("[convert] output read failed:", e);
      return err("FFmpeg produced no output — file may be corrupt or have no audio track", 422);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[convert] done — ${(mp3.length / 1e6).toFixed(1)} MB MP3`);
    }

    // Header-safe: the name came from a request header, so strip quotes,
    // backslashes and control characters rather than interpolating it raw.
    const baseName =
      filename
        .replace(/\.[^.]+$/, "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f"\\]/g, "")
        .slice(0, 100) || "recording";
    return new NextResponse(mp3 as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${baseName}.mp3"`,
      },
    });

  } catch (e) {
    console.error("[convert] unexpected:", e);
    return err(e instanceof Error ? e.message : String(e));
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
}
