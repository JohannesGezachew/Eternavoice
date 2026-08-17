/**
 * Preparing a script to be read aloud.
 *
 * Deliberately nothing like the conversation pipeline. A reply from a persona
 * gets shortened, de-exclaimed and sprinkled with fillers to sound spontaneous;
 * a reading is someone's own words and every one of them is load-bearing. The
 * only thing done here is deciding where the voice breathes.
 */

/** Roughly five minutes of speech. Long enough for a letter, short enough that
 *  nobody pastes a novel into a per-character billing endpoint by accident. */
export const MAX_READING_CHARS = 5000;

export interface ReadingSegment {
  text: string;
  /** Silence after this segment, in milliseconds. */
  pauseMs: number;
}

/** A held beat between sentences — the length of a comfortable breath. */
const SENTENCE_PAUSE_MS = 220;
/** Between paragraphs, long enough to feel like a new thought beginning. */
const PARAGRAPH_PAUSE_MS = 750;
/** Above this, a run-on sentence is broken at a clause so the voice can
 *  breathe. Rare, but a pasted paragraph with no full stops is not. */
const LONG_SENTENCE_CHARS = 280;

function splitSentences(paragraph: string): string[] {
  // Split after terminal punctuation followed by whitespace. Keeps the
  // punctuation with the sentence it belongs to.
  const rough = paragraph
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const sentence of rough) {
    if (sentence.length <= LONG_SENTENCE_CHARS) {
      out.push(sentence);
      continue;
    }
    // Break at clause boundaries rather than mid-word, and only as far as
    // needed — the text itself is never altered, only where it pauses.
    let rest = sentence;
    while (rest.length > LONG_SENTENCE_CHARS) {
      const window = rest.slice(0, LONG_SENTENCE_CHARS);
      const cut = Math.max(
        window.lastIndexOf("; "),
        window.lastIndexOf(", "),
        window.lastIndexOf(" — "),
        window.lastIndexOf(" "),
      );
      const at = cut > LONG_SENTENCE_CHARS * 0.4 ? cut + 1 : LONG_SENTENCE_CHARS;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/**
 * Break a script into the pieces the voice will speak, with the pauses that
 * make it read as prose rather than a queue of clips.
 *
 * Blank lines are honoured: a paragraph break is a longer silence, which is
 * the difference between a letter and a list.
 */
export function splitForReading(script: string): ReadingSegment[] {
  const paragraphs = script
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\n/g, " ").trim())
    .filter(Boolean);

  const segments: ReadingSegment[] = [];
  paragraphs.forEach((paragraph, pIndex) => {
    const sentences = splitSentences(paragraph);
    sentences.forEach((text, sIndex) => {
      const lastInParagraph = sIndex === sentences.length - 1;
      const lastOverall = lastInParagraph && pIndex === paragraphs.length - 1;
      segments.push({
        text,
        // Nothing trailing the final line — the silence at the end belongs to
        // the room, not the recording.
        pauseMs: lastOverall ? 0 : lastInParagraph ? PARAGRAPH_PAUSE_MS : SENTENCE_PAUSE_MS,
      });
    });
  });

  return segments;
}

/** What a script will cost to speak, for the counter beside the field. */
export function readingLength(script: string): number {
  return script.trim().length;
}

/** Roughly how long it will take to hear, at ordinary reading pace. */
export function estimateSpokenSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  // ~150 words per minute is a natural, unhurried read.
  return Math.round((words / 150) * 60);
}

export function formatSpokenLength(script: string): string {
  const seconds = estimateSpokenSeconds(script);
  if (seconds < 60) return `about ${Math.max(1, seconds)} seconds`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
