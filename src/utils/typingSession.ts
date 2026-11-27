/**
 * typingSession.ts
 * ----------------------------------------------------------------------------
 * Wraps the pure Romaji → Kana engine in a Monkeytype-style typing session:
 *   - Typos are typed in-place (in red) and advance the expected position so
 *     you can keep typing without getting stuck.
 *   - Extra letters at the end of a word (before Space) are recorded as extras.
 *   - Pressing Space mid-word skips the rest of that word (marked as missed).
 *   - Backspace restores the exact previous ParserState from the entry log.
 * ----------------------------------------------------------------------------
 */
import type {
  CharState,
  CommittedChunk,
  Entry,
  KanaState,
  KeyOutcome,
  ParserState,
  RomajiPrefs,
  Segment,
  SegmentView,
  TypingSession,
} from '../types/typing';
import { createParser, getGuide, normalizeKey, normalizeReading, planRemaining, processKey } from './romajiEngine.ts';

const MAX_EXTRAS = 12;

function buildIndexMaps(
  segments: readonly Segment[],
  separator: boolean,
): { reading: string; segStart: number[]; segEnd: number[]; segOf: number[] } {
  const segStart: number[] = [];
  const segEnd: number[] = [];
  const segOf: number[] = [];
  let reading = '';

  for (let s = 0; s < segments.length; s++) {
    if (separator && s > 0) {
      reading += ' ';
      segOf.push(s - 1);
    }
    const start = reading.length;
    reading += segments[s].reading;
    const end = reading.length;
    segStart.push(start);
    segEnd.push(end);
    for (let k = start; k < end; k++) segOf.push(s);
  }

  return { reading, segStart, segEnd, segOf };
}

export function createSession(segments: Segment[], separator: boolean): TypingSession {
  const { reading, segStart, segEnd, segOf } = buildIndexMaps(segments, separator);
  return {
    segments,
    separator,
    reading,
    segStart,
    segEnd,
    segOf,
    parser: createParser(reading),
    entries: [],
  };
}

/** Appends more segments to an active session (used for endless time mode). */
export function appendSegments(session: TypingSession, more: Segment[]): TypingSession {
  if (more.length === 0) return session;
  const segments = [...session.segments, ...more];
  const { reading, segStart, segEnd, segOf } = buildIndexMaps(segments, session.separator);
  const normalized = normalizeReading(reading);
  const parser: ParserState = {
    ...session.parser,
    source: reading,
    reading: normalized,
    completed: session.parser.position >= normalized.length,
  };
  return { ...session, segments, reading, segStart, segEnd, segOf, parser };
}

export function currentSegmentIndex(session: TypingSession): number {
  const { parser, segOf, segments } = session;
  if (parser.completed || parser.position >= segOf.length) return segments.length;
  return segOf[parser.position];
}

export interface TypeResult {
  outcome: KeyOutcome;
  session: TypingSession;
  commits: CommittedChunk[];
}

export function typeKey(session: TypingSession, rawKey: string, prefs: RomajiPrefs = {}): TypeResult {
  const { parser, separator, segStart, segEnd, entries } = session;
  if (parser.completed) return { outcome: 'ignored', session, commits: [] };

  const key = normalizeKey(rawKey);
  if (key.length !== 1) return { outcome: 'ignored', session, commits: [] };

  const curSeg = currentSegmentIndex(session);
  const atSeparator = separator && parser.reading[parser.position] === ' ';

  // 1. Pressing Space in words mode
  if (separator && key === ' ') {
    // At the separator space itself -> advance cleanly to next word
    if (atSeparator) {
      const res = processKey(parser, ' ', prefs);
      const entry: Entry = {
        key: ' ',
        kind: 'correct',
        effective: ' ',
        chunkStart: parser.position,
        segment: curSeg,
        before: parser,
      };
      return {
        outcome: 'correct',
        session: { ...session, parser: res.state, entries: [...entries, entry] },
        commits: res.commits,
      };
    }

    // If a pending 'n' can flush into the separator space, let the engine do it
    if (parser.buffer !== '') {
      const res = processKey(parser, ' ', prefs);
      if (res.accepted) {
        const entry: Entry = {
          key: ' ',
          kind: 'correct',
          effective: ' ',
          chunkStart: parser.position,
          segment: curSeg,
          before: parser,
        };
        return {
          outcome: 'correct',
          session: { ...session, parser: res.state, entries: [...entries, entry] },
          commits: res.commits,
        };
      }
    }

    // Ignore Space if nothing has been typed in the current word yet
    const hasTypedInSeg = entries.some((e) => e.segment === curSeg);
    if (parser.position === segStart[curSeg] && parser.buffer === '' && !hasTypedInSeg) {
      return { outcome: 'ignored', session, commits: [] };
    }

    // Otherwise skip the rest of the current word (and its trailing separator)
    const nextPos = Math.min(parser.reading.length, segEnd[curSeg] + 1);
    const nextParser: ParserState = {
      ...parser,
      position: nextPos,
      buffer: '',
      constraint: null,
      completed: nextPos >= parser.reading.length,
    };
    const entry: Entry = {
      key: ' ',
      kind: 'skip',
      effective: '',
      chunkStart: parser.position,
      segment: curSeg,
      skipFrom: parser.position,
      before: parser,
    };
    return {
      outcome: 'skip',
      session: { ...session, parser: nextParser, entries: [...entries, entry] },
      commits: [],
    };
  }

  // 2. Typing letters after a word is already finished (at the separator space) -> extra
  if (atSeparator) {
    let extraCount = 0;
    for (let i = entries.length - 1; i >= 0 && entries[i].segment === curSeg; i--) {
      if (entries[i].kind === 'extra') extraCount++;
    }
    if (extraCount >= MAX_EXTRAS) return { outcome: 'ignored', session, commits: [] };

    const entry: Entry = {
      key,
      kind: 'extra',
      effective: '',
      chunkStart: parser.position,
      segment: curSeg,
      before: parser,
    };
    return {
      outcome: 'extra',
      session: { ...session, entries: [...entries, entry] },
      commits: [],
    };
  }

  // 3. Normal keystroke
  const res = processKey(parser, key, prefs);
  if (res.accepted) {
    const entry: Entry = {
      key,
      kind: 'correct',
      effective: key,
      chunkStart: parser.position,
      segment: curSeg,
      before: parser,
    };
    return {
      outcome: 'correct',
      session: { ...session, parser: res.state, entries: [...entries, entry] },
      commits: res.commits,
    };
  }

  // 4. Typo: type it in red and advance the parser by the expected next character
  const expected = getGuide(parser, prefs).remaining[0];
  if (!expected || expected === ' ') {
    return { outcome: 'ignored', session, commits: [] };
  }
  const fallback = processKey(parser, expected, prefs);
  const entry: Entry = {
    key,
    kind: 'error',
    effective: expected,
    chunkStart: parser.position,
    segment: curSeg,
    before: parser,
  };
  return {
    outcome: 'error',
    session: { ...session, parser: fallback.state, entries: [...entries, entry] },
    commits: [],
  };
}

export function backspace(session: TypingSession): TypingSession {
  if (session.entries.length === 0) return session;
  const last = session.entries[session.entries.length - 1];
  return {
    ...session,
    parser: last.before,
    entries: session.entries.slice(0, -1),
  };
}

/**
 * Ctrl/Alt + Backspace: deletes everything typed in the current word. If the
 * cursor is at the start of a word (only the previous word's separator space
 * remains), the whole previous word is deleted instead — like Monkeytype/editors.
 */
export function deleteWord(session: TypingSession): TypingSession {
  const { entries } = session;
  if (entries.length === 0) return session;
  const target = entries[entries.length - 1].segment;
  let i = entries.length;
  while (i > 0 && entries[i - 1].segment === target) i--;
  return {
    ...session,
    parser: entries[i].before,
    entries: entries.slice(0, i),
  };
}

/* ========================================================================== */
/*  View builder                                                               */
/* ========================================================================== */

function planSegmentSlice(reading: string, start: number, end: number, prefs: RomajiPrefs): string {
  const normalized = normalizeReading(reading);
  const sliceParser: ParserState = {
    source: reading,
    reading: normalized,
    position: start,
    buffer: '',
    constraint: null,
    history: [],
    completed: start >= end,
  };
  return planRemaining(sliceParser, prefs, end)
    .map((c) => c.romaji)
    .join('');
}

export function buildSegmentViews(session: TypingSession, prefs: RomajiPrefs = {}): SegmentView[] {
  const { segments, reading, segStart, segEnd, parser, entries } = session;
  const curSeg = currentSegmentIndex(session);
  const guide = getGuide(parser, prefs);

  // Group entries by segment
  const bySeg: Entry[][] = Array.from({ length: segments.length }, () => []);
  for (const e of entries) {
    if (e.segment >= 0 && e.segment < segments.length) bySeg[e.segment].push(e);
  }

  return segments.map((seg, sIdx) => {
    const start = segStart[sIdx];
    const end = segEnd[sIdx];
    const segEntries = bySeg[sIdx];
    const skipEntry = segEntries.find((e) => e.kind === 'skip');
    const skipFrom = skipEntry?.skipFrom;

    // Track which kana indices had an error
    const errorKana = new Set<number>();
    for (const e of segEntries) {
      if (e.kind === 'error') {
        errorKana.add(e.chunkStart);
      }
    }

    const status: SegmentView['status'] =
      sIdx < curSeg ? 'done' : sIdx === curSeg ? 'current' : 'pending';

    // Kana view
    const kanaChars = Array.from(seg.reading);
    const kana = kanaChars.map((ch, localIdx) => {
      const globalIdx = start + localIdx;
      let state: KanaState;
      if (skipFrom !== undefined && globalIdx >= skipFrom) {
        state = 'missed';
      } else if (globalIdx < parser.position) {
        state = errorKana.has(globalIdx) ? 'error' : 'done';
      } else if (sIdx === curSeg && globalIdx >= guide.activeStart && globalIdx < guide.activeEnd) {
        state = 'active';
      } else {
        state = 'pending';
      }
      return { ch, state };
    });

    // Romaji view
    const romaji: { ch: string; state: CharState }[] = [];
    for (const e of segEntries) {
      if (e.kind === 'skip') continue;
      // Don't render the trailing separator space as a visible romaji character
      if (e.kind === 'correct' && e.key === ' ' && e.chunkStart === end) continue;
      const charState: CharState =
        e.kind === 'correct' ? 'correct' : e.kind === 'error' ? 'error' : 'extra';
      romaji.push({ ch: e.key, state: charState });
    }

    const caretAt = sIdx === curSeg ? romaji.length : null;

    if (skipFrom !== undefined) {
      const missedStr = planSegmentSlice(reading, skipFrom, end, prefs);
      for (const ch of missedStr) romaji.push({ ch, state: 'missed' });
    } else if (sIdx === curSeg && parser.position < end) {
      const remStr = planRemaining(parser, prefs, end)
        .map((c) => c.romaji)
        .join('');
      for (const ch of remStr) romaji.push({ ch, state: 'pending' });
    } else if (sIdx > curSeg) {
      const futStr = planSegmentSlice(reading, start, end, prefs);
      for (const ch of futStr) romaji.push({ ch, state: 'pending' });
    }

    const hasError =
      status === 'done' && segEntries.some((e) => e.kind === 'error' || e.kind === 'extra' || e.kind === 'skip');

    return {
      index: sIdx,
      text: seg.text,
      kanaOnly: seg.text === seg.reading,
      kana,
      romaji,
      caretAt,
      status,
      hasError,
    };
  });
}

/* ========================================================================== */
/*  Metrics                                                                    */
/* ========================================================================== */

export function sessionMetrics(session: TypingSession): {
  correctChars: number;
  uncorrected: number;
  completedWords: number;
  completedKana: number;
} {
  let correctChars = 0;
  let uncorrected = 0;
  for (const e of session.entries) {
    if (e.kind === 'correct') correctChars++;
    else uncorrected++;
  }

  const curSeg = currentSegmentIndex(session);
  const completedWords = session.parser.completed ? session.segments.length : curSeg;

  // Count kana up to parser.position excluding skipped kana and separator spaces
  const skipped = new Set<number>();
  for (const e of session.entries) {
    if (e.kind === 'skip' && e.skipFrom !== undefined) {
      const end = session.segEnd[e.segment];
      for (let k = e.skipFrom; k < end; k++) skipped.add(k);
    }
  }
  let completedKana = 0;
  for (let k = 0; k < session.parser.position; k++) {
    if (session.reading[k] !== ' ' && !skipped.has(k)) completedKana++;
  }

  return { correctChars, uncorrected, completedWords, completedKana };
}
