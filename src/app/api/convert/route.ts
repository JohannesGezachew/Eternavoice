import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

const run = promisify(execFile);

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let tmpDir: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("audio") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const id = randomBytes(8).toString("hex");
    tmpDir = join(tmpdir(), `ev-${id}`);
    await mkdir(tmpDir);

    const ext = (file.name.split(".").pop() ?? "bin")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const inputPath = join(tmpDir, `in.${ext}`);
    const outputPath = join(tmpDir, "out.mp3");

    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    await run("ffmpeg", [
      "-i", inputPath,
      "-vn",                  // strip video
      "-acodec", "libmp3lame",
      "-b:a", "128k",
      "-ar", "22050",
      "-y",                   // overwrite if exists
      outputPath,
    ]);

    const mp3 = await readFile(outputPath);
    const baseName = file.name.replace(/\.[^.]+$/, "");

    return new NextResponse(mp3, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${baseName}.mp3"`,
      },
    });
  } catch (err) {
    console.error("[convert]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conversion failed" },
      { status: 500 },
    );
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
}
