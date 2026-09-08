import {
  computeTypewriterStep,
  getCommonPrefixLength,
  getNextChunk,
  MIN_CHARACTER_DELAY_MS,
  TypewriterRevealStep,
} from '../typewriter';

const WORD_DELAY = 40;

/**
 * Drive the reveal to completion, recording every step that changed what is on
 * screen. `feed` decides what text has "arrived" by the time each step runs,
 * which is how we simulate different network chunking over identical final
 * text. The loop stops at `caught-up`, so that case never reaches the result.
 */
function runReveal(feed: (stepIndex: number) => string): TypewriterRevealStep[] {
  const steps: TypewriterRevealStep[] = [];
  let displayed = '';

  for (let i = 0; i < 500; i++) {
    const step = computeTypewriterStep(displayed, feed(i), WORD_DELAY);
    if (step.kind === 'caught-up') break;
    steps.push(step);
    displayed = step.text;
  }

  return steps;
}

describe('getNextChunk', () => {
  it('returns an empty string at the end of the text', () => {
    expect(getNextChunk('hello', 5)).toBe('');
  });

  it('takes a word together with its trailing space', () => {
    expect(getNextChunk('hello world', 0)).toBe('hello ');
  });

  it('takes the final word without trailing space', () => {
    expect(getNextChunk('hello world', 6)).toBe('world');
  });

  it('takes a run of leading whitespace on its own', () => {
    expect(getNextChunk('   hello', 0)).toBe('   ');
  });

  it('treats a newline run as whitespace', () => {
    expect(getNextChunk('\n\nnext', 0)).toBe('\n\n');
  });

  it('keeps punctuation attached to its word', () => {
    expect(getNextChunk('Hi, there', 0)).toBe('Hi, ');
  });
});

describe('getCommonPrefixLength', () => {
  it('is zero for strings that diverge immediately', () => {
    expect(getCommonPrefixLength('abc', 'xyz')).toBe(0);
  });

  it('is the full length for identical strings', () => {
    expect(getCommonPrefixLength('abc', 'abc')).toBe(3);
  });

  it('stops at the first difference', () => {
    expect(getCommonPrefixLength('hello world', 'hello there')).toBe(6);
  });

  it('handles one string being a prefix of the other', () => {
    expect(getCommonPrefixLength('hel', 'hello')).toBe(3);
  });

  it('handles empty input', () => {
    expect(getCommonPrefixLength('', 'hello')).toBe(0);
  });
});

describe('computeTypewriterStep', () => {
  it('reports caught-up when displayed matches the target', () => {
    expect(computeTypewriterStep('hello', 'hello', WORD_DELAY)).toEqual({ kind: 'caught-up' });
  });

  it('reports caught-up for two empty strings', () => {
    expect(computeTypewriterStep('', '', WORD_DELAY)).toEqual({ kind: 'caught-up' });
  });

  it('advances one word at a time', () => {
    const step = computeTypewriterStep('', 'hello world', WORD_DELAY);
    expect(step).toMatchObject({ kind: 'advance', text: 'hello ' });
  });

  it('never overshoots the text that has arrived', () => {
    const step = computeTypewriterStep('hello ', 'hello wor', WORD_DELAY);
    expect(step).toMatchObject({ kind: 'advance', text: 'hello wor' });
  });

  it('spreads the word budget across the word so pacing stays even', () => {
    const short = computeTypewriterStep('', 'ab ', WORD_DELAY);
    const long = computeTypewriterStep('', 'abcdefgh ', WORD_DELAY);

    // floor(40/2)=20 per char over 3 chars vs floor(40/8)=5 -> clamped to 10 over 9.
    expect(short).toMatchObject({ delayMs: 60 });
    expect(long).toMatchObject({ delayMs: 9 * MIN_CHARACTER_DELAY_MS });
  });

  it('clamps very long words to the minimum per-character delay', () => {
    const word = 'a'.repeat(50);
    const step = computeTypewriterStep('', word, WORD_DELAY);

    expect(step).toEqual({
      kind: 'advance',
      text: word,
      delayMs: 50 * MIN_CHARACTER_DELAY_MS,
    });
  });

  it('rewinds to the shared prefix when the server revises the text', () => {
    expect(computeTypewriterStep('hello wor', 'hello there', WORD_DELAY)).toEqual({
      kind: 'rewind',
      text: 'hello ',
      delayMs: 0,
    });
  });

  it('rewinds all the way to empty when the text is replaced outright', () => {
    expect(computeTypewriterStep('hello', 'goodbye', WORD_DELAY)).toEqual({
      kind: 'rewind',
      text: '',
      delayMs: 0,
    });
  });

  it('rewinds without delay so the correction is not visible as a stall', () => {
    const step = computeTypewriterStep('abc', 'abd', WORD_DELAY);
    expect(step.kind === 'rewind' && step.delayMs).toBe(0);
  });

  describe('cadence versus network chunking', () => {
    const FULL = 'The quick brown fox jumps over the lazy dog.';

    it('is identical for any chunking that stays ahead of the reveal', () => {
      const allAtOnce = runReveal(() => FULL);
      // 12 characters arrive per step; the reveal advances by roughly one
      // five-character word, so it is never starved.
      const chunked = runReveal((i) => FULL.slice(0, Math.min(FULL.length, (i + 1) * 12)));
      // Deliberately uneven arrivals, still ahead of the reveal.
      const irregular = runReveal((i) =>
        FULL.slice(0, Math.min(FULL.length, [16, 17, 39, 40, FULL.length][Math.min(i, 4)])),
      );

      expect(chunked).toEqual(allAtOnce);
      expect(irregular).toEqual(allAtOnce);
    });

    it('advances only as far as the text that has arrived when the reveal outruns the network', () => {
      // One character arrives per step, so the reveal is starved on every step.
      // It shows the partial word rather than stalling, which means the reveal
      // degrades to character-at-a-time — the only way chunking changes the step
      // sequence, and it never changes what is finally shown.
      const drip = runReveal((i) => FULL.slice(0, Math.min(FULL.length, i + 1)));
      const allAtOnce = runReveal(() => FULL);

      expect(drip.slice(0, 5).map((step) => step.text)).toEqual([
        'T',
        'Th',
        'The',
        'The ',
        'The q',
      ]);
      // Unstarved, the same text advances a whole word at a time.
      expect(allAtOnce.slice(0, 2).map((step) => step.text)).toEqual(['The ', 'The quick ']);
      expect(drip.length).toBeGreaterThan(allAtOnce.length);
    });

    it('never displays text that has not arrived', () => {
      let displayed = '';
      for (let i = 0; i < 500; i++) {
        const arrived = FULL.slice(0, Math.min(FULL.length, i + 1));
        const step = computeTypewriterStep(displayed, arrived, WORD_DELAY);
        if (step.kind === 'caught-up') break;
        expect(arrived.startsWith(step.text)).toBe(true);
        expect(step.text.length).toBeGreaterThanOrEqual(displayed.length);
        displayed = step.text;
      }
    });

    it('converges on exactly the full text under every chunking', () => {
      const feeds = [
        () => FULL,
        (i: number) => FULL.slice(0, Math.min(FULL.length, i + 1)),
        (i: number) => FULL.slice(0, Math.min(FULL.length, (i + 1) * 7)),
      ];

      for (const feed of feeds) {
        const steps = runReveal(feed);
        expect(steps[steps.length - 1].text).toBe(FULL);
      }
      expect(computeTypewriterStep(FULL, FULL, WORD_DELAY)).toEqual({ kind: 'caught-up' });
    });

    it('resumes with an identical tail from any displayed prefix', () => {
      // The step decision reads nothing but (displayed, target), so how the
      // reveal reached a given prefix cannot affect what follows.
      const full = runReveal(() => FULL);
      const midpoint = full[3].text;
      const resumed = runReveal(() => FULL);

      let displayed = midpoint;
      const tail: TypewriterRevealStep[] = [];
      for (let i = 0; i < 500; i++) {
        const step = computeTypewriterStep(displayed, FULL, WORD_DELAY);
        if (step.kind === 'caught-up') break;
        tail.push(step);
        displayed = step.text;
      }

      expect(tail).toEqual(resumed.slice(4));
    });
  });
});
