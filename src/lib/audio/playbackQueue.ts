"use client";

/**
 * Sequential audio playback queue with amplitude analysis.
 *
 * Each clip (a complete MP3 byte buffer for one persona sentence) is decoded
 * via Web Audio's decodeAudioData and scheduled gaplessly on a single
 * AudioContext. An AnalyserNode taps the output for the visualiser.
 *
 * decodeAudioData is universally supported in modern browsers (including iOS
 * Safari from 14.5+), making this both more reliable and more flexible than
 * MediaSource Extensions for short sentence buffers.
 */

export interface PlaybackQueueOptions {
  onAmplitude?: (rms: number) => void;
  onActivityChange?: (active: boolean) => void;
}

export class PlaybackQueue {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private nextStart = 0;
  private activeSources = 0;
  private sources = new Set<AudioBufferSourceNode>();
  /** Pending onStart timers, cleared on stop so a cancelled reading doesn't
   *  keep advancing the words it is no longer speaking. */
  private startTimers = new Set<ReturnType<typeof setTimeout>>();
  private rafId = 0;
  private timeBuffer: Uint8Array<ArrayBuffer> | null = null;
  private opts: PlaybackQueueOptions;
  private destroyed = false;
  private rate = 1;
  /** Set only by pause(). enqueue() calls unlock(), which would otherwise
   *  resume the context the moment the next sentence arrived — so a paused
   *  reply would start speaking again on its own. */
  private userPaused = false;
  /**
   * Bumped by stop() and destroy(). enqueue() awaits unlock() and then
   * decodeAudioData — tens of milliseconds on a slow phone — and a barge-in
   * landing inside that window could not unwind the caller, so the decode
   * finished and the sentence played *over* the person who had just
   * interrupted, with the status flipping back to "speaking" underneath the
   * "I'm listening" they were shown. Every await now checks it is still the
   * same generation before touching anything.
   */
  private generation = 0;

  constructor(opts: PlaybackQueueOptions = {}) {
    this.opts = opts;
  }

  /** Playback speed for everything queued from now on (0.5–2 sensible). */
  setRate(rate: number): void {
    this.rate = Math.min(2, Math.max(0.5, rate || 1));
  }

  async unlock(): Promise<void> {
    if (this.destroyed) return;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio is not supported.");
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 1.0;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.78;
      this.master.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.timeBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.startMonitor();
    }
    if (this.context.state === "suspended" && !this.userPaused) {
      await this.context.resume();
    }
  }

  /**
   * Hooks that fire against the *clock*, not against delivery.
   *
   * Audio arrives far faster than it plays — a five-minute reading is fully
   * downloaded in seconds — so anything following along on screen has to be
   * driven by when a clip actually starts, or the words race ahead of the
   * voice. Source nodes have no onstart, but the start time is known at
   * schedule time, so the delay is exact.
   */
  async enqueue(
    buffer: ArrayBuffer,
    pauseMs = 0,
    hooks?: { onStart?: () => void; onEnd?: () => void },
  ): Promise<void> {
    if (this.destroyed) return;
    const mine = this.generation;
    await this.unlock();
    if (this.generation !== mine || !this.context || !this.master) return;

    let decoded: AudioBuffer;
    try {
      decoded = await this.context.decodeAudioData(buffer.slice(0));
    } catch {
      return;
    }
    // Checked again after the decode: this is the window a barge-in lands in.
    if (this.destroyed || this.generation !== mine || !this.context) return;

    const startAt = Math.max(this.context.currentTime + 0.02, this.nextStart);
    const source = this.context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = this.rate;
    source.connect(this.master);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.activeSources -= 1;
      // Only for a clip that actually finished. stop() also triggers onended,
      // and firing onEnd there told the reading room a reading had completed
      // when it had just been cancelled — bouncing "Edit" straight back to the
      // finished screen, and opening a saved reading into an empty one.
      if (this.generation === mine) hooks?.onEnd?.();
      if (this.activeSources <= 0) {
        this.activeSources = 0;
        this.opts.onActivityChange?.(false);
      }
    };
    if (hooks?.onStart) {
      const delayMs = Math.max(0, (startAt - this.context.currentTime) * 1000);
      const timer = setTimeout(() => {
        this.startTimers.delete(timer);
        if (!this.destroyed) hooks.onStart?.();
      }, delayMs);
      this.startTimers.add(timer);
    }
    this.activeSources += 1;
    if (this.activeSources === 1) {
      this.opts.onActivityChange?.(true);
    }
    source.start(startAt);
    this.nextStart = startAt + decoded.duration / this.rate + Math.max(0, pauseMs) / 1000;
  }

  /**
   * Hold this thought — suspend the clock without discarding what's queued.
   *
   * Distinct from stop(): muting and interrupting both end the reply, but
   * "wait, let me sit with that" is a third thing entirely, and this product
   * is full of moments that deserve it. Suspending the AudioContext freezes
   * currentTime, so everything already scheduled resumes exactly where it was.
   */
  async pause(): Promise<void> {
    if (this.destroyed || !this.context) return;
    if (this.context.state !== "running") return;
    this.userPaused = true;
    await this.context.suspend();
    // Deliberately NOT onActivityChange(false): a suspended context is held,
    // not idle. Reporting it as inactive flipped the room to "idle", which
    // unmounted the very control that offers to continue — so holding a
    // thought became a one-way trap with the reply unreachable behind it.
  }

  async resume(): Promise<void> {
    if (this.destroyed || !this.context) return;
    this.userPaused = false;
    if (this.context.state !== "suspended") return;
    await this.context.resume();
    if (this.activeSources > 0) this.opts.onActivityChange?.(true);
  }

  get paused(): boolean {
    return this.context?.state === "suspended";
  }

  stop(): void {
    // Invalidates every decode still in flight and every scheduled hook.
    this.generation++;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // ignored
      }
    }
    this.sources.clear();
    for (const timer of this.startTimers) clearTimeout(timer);
    this.startTimers.clear();
    this.nextStart = 0;
    this.activeSources = 0;
    // A pause that survived being stopped would silently swallow the next
    // reply, since unlock() honours the flag.
    this.userPaused = false;
    void this.context?.resume().catch(() => null);
    this.opts.onActivityChange?.(false);
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    cancelAnimationFrame(this.rafId);
    for (const timer of this.startTimers) clearTimeout(timer);
    this.startTimers.clear();
    this.opts.onActivityChange?.(false);
    if (this.context) {
      try {
        void this.context.close();
      } catch {
        // ignored
      }
    }
    this.context = null;
    this.analyser = null;
    this.master = null;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private startMonitor() {
    const tick = () => {
      if (this.destroyed) return;
      // Nothing is playing, so there is nothing to measure. This loop used to
      // run from unlock() until destroy() — a 1,024-iteration RMS pass every
      // frame for the whole session, most of it over silence.
      if (this.activeSources === 0) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      if (this.analyser && this.timeBuffer) {
        this.analyser.getByteTimeDomainData(this.timeBuffer);
        let sumSq = 0;
        for (let i = 0; i < this.timeBuffer.length; i++) {
          const v = ((this.timeBuffer[i] ?? 128) - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / this.timeBuffer.length);
        this.opts.onAmplitude?.(rms);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
