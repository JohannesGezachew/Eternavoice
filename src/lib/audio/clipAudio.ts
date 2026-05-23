// Fast WAV slicer — works at the byte level, no AudioContext re-decode.
// Only handles the canonical 44-byte-header PCM format produced by our encoder.
// Returns null if the file isn't that format; caller falls back to clipAudio.
export async function sliceWavBytes(
  file: File,
  startSec: number,
  endSec: number,
): Promise<File | null> {
  const ab = await file.arrayBuffer();
  if (ab.byteLength < 44) return null;

  const v = new DataView(ab);
  const s4 = (o: number) =>
    String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

  if (s4(0) !== "RIFF" || s4(8) !== "WAVE" || s4(36) !== "data") return null;

  const numChannels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bitsPerSample = v.getUint16(34, true);
  const blockAlign = numChannels * Math.ceil(bitsPerSample / 8);
  const bytesPerSec = sampleRate * blockAlign;

  const HEADER = 44;
  const startByte = Math.floor(startSec * bytesPerSec / blockAlign) * blockAlign;
  const endByte = Math.floor(endSec * bytesPerSec / blockAlign) * blockAlign;
  const availableAudio = ab.byteLength - HEADER;
  const sliceStart = Math.min(startByte, availableAudio);
  const sliceEnd = Math.min(endByte, availableAudio);
  const audioBytes = sliceEnd - sliceStart;

  if (audioBytes <= 0) return null;
  if (sliceStart === 0 && sliceEnd >= availableAudio) return null; // nothing to clip

  const totalSize = HEADER + audioBytes;
  const out = new ArrayBuffer(totalSize);
  new Uint8Array(out).set(new Uint8Array(ab, 0, HEADER));
  new Uint8Array(out, HEADER).set(new Uint8Array(ab, HEADER + sliceStart, audioBytes));

  const dv = new DataView(out);
  dv.setUint32(4, totalSize - 8, true);
  dv.setUint32(40, audioBytes, true);

  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([out], `${base}_clip.wav`, { type: "audio/wav" });
}

// Always resamples to 22050 Hz mono so the output is compact (~2.6 MB / 60 s)
// regardless of the input's sample rate or channel count.
export async function clipAudio(file: File, start: number, end: number): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close().catch(() => null);
  }

  const srcSr = decoded.sampleRate;
  const startSample = Math.floor(start * srcSr);
  const endSample = Math.min(Math.floor(end * srcSr), decoded.length);
  const clipLen = endSample - startSample;
  if (clipLen <= 0) throw new Error("Clip range is empty.");

  // Render clip at 22050 Hz mono via OfflineAudioContext.
  // OfflineAudioContext handles both resampling and stereo→mono downmix.
  const TARGET_SR = 22050;
  const targetLen = Math.ceil((clipLen / srcSr) * TARGET_SR);
  const offline = new OfflineAudioContext(1, targetLen, TARGET_SR);

  // Build a temporary buffer containing just the clip at the original sample rate.
  const tmp = offline.createBuffer(decoded.numberOfChannels, clipLen, srcSr);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    tmp.copyToChannel(decoded.getChannelData(ch).subarray(startSample, endSample), ch);
  }

  const src = offline.createBufferSource();
  src.buffer = tmp;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
