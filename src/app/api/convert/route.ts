import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const exec = promisify(execFile);

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  let tmpDir: string | null = null;

  try {
    // ── 1. Read filename from header ───────────────────────────────────────
    const rawName = req.headers.get("x-filename") ?? "input.bin";
    const filename = (() => {
      try { return decodeURIComponent(rawName); } catch { return rawName; }
    })();
    const ext = (filename.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ?? "bin").toLowerCase() || "bin";

    // ── 2. Read raw body ───────────────────────────────────────────────────
    let bodyBuf: Buffer;
    try {
      const ab = await req.arrayBuffer();
      if (!ab.byteLength) return err("Empty file received", 400);
      bodyBuf = Buffer.from(ab);
    } catch (e) {
      console.error("[convert] body read failed:", e);
      return err(`Could not read upload: ${e instanceof Error ? e.message : String(e)}`, 400);
    }

    console.log(`[convert] received ${filename} (${(bodyBuf.length / 1e6).toFixed(1)} MB)`);

    // ── 3. Write to temp dir ───────────────────────────────────────────────
    const id = randomBytes(8).toString("hex");
    tmpDir = join(tmpdir(), `ev-${id}`);
    await mkdir(tmpDir);

    const inputPath = join(tmpDir, `in.${ext}`);
    const outputPath = join(tmpDir, "out.mp3");

    await writeFile(inputPath, bodyBuf);

    // ── 4. Convert with ffmpeg ─────────────────────────────────────────────
    try {
      await exec("/usr/bin/ffmpeg", [
        "-i", inputPath,
        "-vn",                   // drop video
        "-acodec", "libmp3lame",
        "-b:a", "128k",
        "-ar", "22050",
        "-y",
        outputPath,
      ]);
    } catch (e) {
      const fe = e as { stderr?: string; message?: string };
      const detail = (fe.stderr ?? fe.message ?? String(e)).trim();
      console.error("[convert] ffmpeg error:\n" + detail);
      return err(`FFmpeg error: ${detail.slice(-400)}`, 422);
    }

    // ── 5. Read and return MP3 ─────────────────────────────────────────────
    let mp3: Buffer;
    try {
      mp3 = await readFile(outputPath);
    } catch (e) {
      console.error("[convert] output read failed:", e);
      return err("FFmpeg produced no output — file may be corrupt or have no audio track", 422);
    }

    console.log(`[convert] done — ${(mp3.length / 1e6).toFixed(1)} MB MP3`);

    const baseName = filename.replace(/\.[^.]+$/, "");
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
