/* ------------------------------------------------------------------ */
/*  Text content                                                       */
/* ------------------------------------------------------------------ */

/** A typeable unit with its own furigana block: a word, or a phrase chunk of a quote. */
export interface Segment {
  /** Display text (Kanji / Kana mix), e.g. 図書館 */
  text: string;
  /** Kana reading. Katakana is allowed and normalized internally. */
  reading: string;
}

export interface WordItem extends Segment {
  id: string;
  meaning: string;
}

export type QuoteLength = 'short' | 'medium' | 'long';
export type QuoteLengthFilter = QuoteLength | 'all';

export interface QuoteItem {
  id: string;
  segments: Segment[];
  /** Attribution, e.g. 夏目漱石『草枕』 */
  source: string;
  /** English translation */
  meaning: string;
  kanaCount: number;
  length: QuoteLength;
}

/* ------------------------------------------------------------------ */
/*  Romaji engine                                                      */
/* ------------------------------------------------------------------ */

/** One valid keystroke sequence that consumes `length` kana starting at the cursor. */
export interface Candidate {
  romaji: string;
  length: number;
  /** The kana slice this candidate consumes (normalized hiragana). */
  kana: string;
  /** Sokuon doubling: the next chunk must start with this character. */
  constraint?: string;
  /** True when this candidate is a doubled consonant standing for っ. */
  sokuon?: boolean;
}

/** A chunk of kana that has been fully typed. */
export interface CommittedChunk {
  start: number;
  length: number;
  kana: string;
  romaji: string;
  sokuon: boolean;
}

export interface ParserState {
  /** Original reading as provided (may contain katakana). */
  source: string;
  /** Normalized hiragana reading (same length / indices as `source`). */
  reading: string;
  /** Index of the first kana not yet committed. */
  position: number;
  /** Romaji keys typed for the chunk in progress. */
  buffer: string;
  /** Required leading character for the next chunk (after sokuon doubling). */
  constraint: string | null;
  history: CommittedChunk[];
  completed: boolean;
}

/** Learned spelling preferences: kana slice -> romaji the user last used. */
export type RomajiPrefs = Record<string, string>;

export interface KeyResult {
  accepted: boolean;
  state: ParserState;
  /** Chunks committed by this key press (0, 1 or 2 when a pending ん is flushed). */
  commits: CommittedChunk[];
}

/** Predicted romaji for one upcoming chunk (the first one excludes the typed buffer). */
export interface PlannedChunk {
  start: number;
  length: number;
  romaji: string;
}

export interface RomajiGuide {
  typed: string;
  remaining: string;
  activeStart: number;
  activeEnd: number;
}

/* ------------------------------------------------------------------ */
/*  Typing session (free typing with typos + backspace)                */
/* ------------------------------------------------------------------ */

/**
 * correct — key matched a valid spelling
 * error   — wrong key; the expected character is consumed in its place
 * extra   — letter typed after a word was finished (before space)
 * skip    — space pressed mid-word: rest of the word is marked as missed
 */
export type EntryKind = 'correct' | 'error' | 'extra' | 'skip';
export type KeyOutcome = EntryKind | 'ignored';

export interface Entry {
  key: string;
  kind: EntryKind;
  /** Characters actually fed to the engine. */
  effective: string;
  /** Kana index of the chunk this keystroke belongs to. */
  chunkStart: number;
  segment: number;
  /** For skips: first kana index that was skipped. */
  skipFrom?: number;
  /** Parser snapshot before this entry (backspace restores it). */
  before: ParserState;
}

export interface TypingSession {
  segments: Segment[];
  /** Words mode: segments are separated by a typed space. */
  separator: boolean;
  /** Full kana reading of the test (with spaces between words when separated). */
  reading: string;
  segStart: number[];
  segEnd: number[];
  /** kana index -> segment index (separator spaces belong to the previous segment) */
  segOf: number[];
  parser: ParserState;
  entries: Entry[];
}

export type CharState = 'correct' | 'error' | 'extra' | 'missed' | 'pending';
export type KanaState = 'done' | 'error' | 'missed' | 'active' | 'pending';

export interface SegmentView {
  index: number;
  text: string;
  kanaOnly: boolean;
  kana: { ch: string; state: KanaState }[];
  romaji: { ch: string; state: CharState }[];
  /** Index in `romaji` where the caret sits (only on the current segment). */
  caretAt: number | null;
  status: 'done' | 'current' | 'pending';
  hasError: boolean;
}

/* ------------------------------------------------------------------ */
/*  Test configuration & stats                                         */
/* ------------------------------------------------------------------ */

export type TestKind = 'words' | 'sentences' | 'custom';
export type TestMode = 'time' | 'words';
export type TestStatus = 'idle' | 'running' | 'finished';

export interface TestConfig {
  kind: TestKind;
  /** Words kind only: time-limited or word-count. */
  mode: TestMode;
  /** Seconds for time mode, word count for words mode. */
  amount: number;
  /** Sentences kind only. */
  quoteLength: QuoteLengthFilter;
}

export interface StudySettings {
  showFurigana: boolean;
  showRomaji: boolean;
}

/** All-time keystroke counters (backspace does not undo them). */
export interface TestStats {
  correctKeys: number;
  errorKeys: number;
}

/** Cumulative counters captured at (roughly) every elapsed second. */
export interface SpeedSample {
  second: number;
  correct: number;
  errors: number;
}

export interface TestResult {
  /** Correct keystrokes remaining in the final text per minute. */
  kpm: number;
  wpm: number;
  /** All keystrokes per minute. */
  rawKpm: number;
  accuracy: number;
  errors: number;
  /** Mistakes left in the final text. */
  uncorrected: number;
  correctKeys: number;
  completedWords: number;
  completedKana: number;
  durationSec: number;
}
