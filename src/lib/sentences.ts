/**
 * Streaming sentence buffer.
 *
 * Accepts incremental token text and emits complete sentences as soon as a
 * terminal punctuation mark is seen — or at a soft length cap, so we never
 * sit on a 200-character clause waiting for a period.
 */

const TERMINALS = new Set([".", "!", "?", "…", ";", ":"]);
const SOFT_CAP = 100;
const HARD_CAP = 200;

export class SentenceBuffer {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];

    let cursor = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (!ch) continue;

      const lengthSoFar = i - cursor + 1;
      const isTerminal = TERMINALS.has(ch);
      const isLineBreak = ch === "\n";
      const overSoftCap =
        lengthSoFar >= SOFT_CAP && (ch === "," || ch === " " || ch === "—");
      const overHardCap = lengthSoFar >= HARD_CAP;

      if (isTerminal || isLineBreak || overSoftCap || overHardCap) {
        if (isTerminal) {
          // Don't break on `.` if it's part of a number / abbreviation
          // (basic heuristic: previous char is a digit or it's followed by a digit)
          const prev = this.buffer[i - 1];
          const next = this.buffer[i + 1];
          if (
            ch === "." &&
            ((prev && /[0-9A-Z]/.test(prev) && next && /[0-9]/.test(next)) ||
              (prev && /[A-Z]/.test(prev) && (i - 2 < 0 || this.buffer[i - 2] === " ")))
          ) {
            continue;
          }
        }
        const sentence = this.buffer.slice(cursor, i + 1).trim();
        if (sentence.length >= 2) out.push(sentence);
        cursor = i + 1;
      }
    }
    this.buffer = this.buffer.slice(cursor);
    return out;
  }

  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining.length >= 2 ? remaining : null;
  }
}
