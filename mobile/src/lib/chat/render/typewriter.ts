/**
 * Pure typewriter reveal timing.
 *
 * The transcript reveals assistant text at a steady, readable pace that is
 * deliberately decoupled from network arrival: the model may emit one huge
 * chunk or fifty tiny ones, and the reader must not be able to tell. Every
 * decision the animation makes is a function of just two strings — what is
 * currently displayed and what has arrived so far — plus the configured word
 * delay. Nothing here reads a clock or holds state, so the cadence for a given
 * (displayed, target) pair is identical no matter how the target grew.
 */

/** Floor on per-character pacing so long words do not crawl. */
export const MIN_CHARACTER_DELAY_MS = 10;

/**
 * The next unit to reveal: a run of whitespace, or a word plus its trailing
 * whitespace. Falls back to a single character when the text does not match
 * either shape.
 */
export function getNextChunk(text: string, startIndex: number): string {
  const remaining = text.slice(startIndex);
  if (!remaining) return '';

  const match = remaining.match(/^(\s+|\S+\s*)/);
  return match?.[0] || remaining[0];
}

/** Length of the shared leading run of two strings. */
export function getCommonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;

  while (index < max && a[index] === b[index]) {
    index += 1;
  }

  return index;
}

export type TypewriterStep =
  /** Displayed text has caught up with everything that has arrived. */
  | { kind: 'caught-up' }
  /**
   * The target no longer starts with what is displayed — the server revised the
   * text mid-stream. Roll back to the shared prefix immediately, then resume.
   */
  | { kind: 'rewind'; text: string; delayMs: number }
  /** Reveal one more chunk after the given delay. */
  | { kind: 'advance'; text: string; delayMs: number };

/**
 * The steps that actually change what is on screen. Callers that only handle
 * the revealing cases — after breaking on `caught-up` — can name this instead
 * of re-narrowing the union at every use.
 */
export type TypewriterRevealStep = Exclude<TypewriterStep, { kind: 'caught-up' }>;

/**
 * Decide the next reveal step. `wordDelay` is the nominal budget per word; it
 * is spread across the word's characters so short and long words read at a
 * comparable speed.
 */
export function computeTypewriterStep(
  displayedText: string,
  targetText: string,
  wordDelay: number,
): TypewriterStep {
  if (displayedText === targetText) {
    return { kind: 'caught-up' };
  }

  if (!targetText.startsWith(displayedText)) {
    const commonPrefixLength = getCommonPrefixLength(displayedText, targetText);
    return { kind: 'rewind', text: displayedText.slice(0, commonPrefixLength), delayMs: 0 };
  }

  const chunk = getNextChunk(targetText, displayedText.length);
  const text = targetText.slice(0, displayedText.length + chunk.length);

  const characterDelay = Math.max(
    MIN_CHARACTER_DELAY_MS,
    Math.floor(wordDelay / Math.max(1, chunk.trim().length)),
  );

  return { kind: 'advance', text, delayMs: characterDelay * Math.max(1, chunk.length) };
}
