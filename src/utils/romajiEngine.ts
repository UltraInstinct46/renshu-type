/**
 * romajiEngine.ts
 * ----------------------------------------------------------------------------
 * A standalone, IME-free Romaji → Kana state machine.
 *
 * Model
 *   The target reading is a string of hiragana. At any cursor position the
 *   engine derives the list of *candidates*: every romaji spelling that can
 *   consume the next 1–2 kana (e.g. at "しゃ": sha / sya / shi+… / si+…).
 *   Each key press narrows the candidates by prefix. When exactly one
 *   spelling is fully typed (and nothing longer still matches) the chunk is
 *   committed and the cursor advances.
 *
 *   Special chunks:
 *     っ — a single consonant equal to the first letter of the next chunk
 *          (the next chunk is then constrained to start with that letter),
 *          or explicit xtu / ltu / xtsu / ltsu.
 *     ん — "n" only if the next chunk can't start with a vowel, y or n and
 *          it isn't the last kana; otherwise nn / n' / xn.
 *          A pending "n" is flushed when the next key doesn't extend it.
 *
 * Everything here is pure; no DOM, no React.
 * ----------------------------------------------------------------------------
 */
import type {
  Candidate,
  CommittedChunk,
  KeyResult,
  ParserState,
  PlannedChunk,
  RomajiGuide,
  RomajiPrefs,
} from '../types/typing';

/* ========================================================================== */
/*  Tables                                                                     */
/* ========================================================================== */

const SINGLE: Readonly<Record<string, readonly string[]>> = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['shi', 'si', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], ゐ: ['wyi'], ゑ: ['wye'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  // small kana
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li', 'xyi', 'lyi'], ぅ: ['xu', 'lu'],
  ぇ: ['xe', 'le', 'xye', 'lye'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
  ゎ: ['xwa', 'lwa'], ゕ: ['xka', 'lka'], ゖ: ['xke', 'lke'],
  // punctuation
  ー: ['-'], '、': [','], '。': ['.'], '，': [','], '．': ['.'],
  '？': ['?'], '！': ['!'], '・': ['/'], '「': ['['], '」': [']'],
  '〜': ['~'], '～': ['~'], ' ': [' '], '　': [' '],
};

const SOKUON_EXPLICIT = ['xtu', 'ltu', 'xtsu', 'ltsu'] as const;
const HATSUON_BASE = ['nn', "n'", 'xn'] as const;
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/** Two-kana combinations (yōon + loanword combos). */
const COMBO: Record<string, string[]> = {};

function addCombo(kana: string, romaji: readonly string[]): void {
  COMBO[kana] = [...(COMBO[kana] ?? []), ...romaji];
}

(() => {
  const yoonRows: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['き', ['ky']], ['ぎ', ['gy']], ['に', ['ny']], ['ひ', ['hy']],
    ['び', ['by']], ['ぴ', ['py']], ['み', ['my']], ['り', ['ry']],
    ['し', ['sh', 'sy']],
    ['ち', ['ch', 'ty', 'cy']],
    ['じ', ['j', 'zy', 'jy']],
    ['ぢ', ['dy']],
  ];
  const smalls: ReadonlyArray<readonly [string, string]> = [
    ['ゃ', 'a'], ['ぃ', 'i'], ['ゅ', 'u'], ['ぇ', 'e'], ['ょ', 'o'],
  ];
  for (const [base, prefixes] of yoonRows) {
    for (const [small, vowel] of smalls) {
      // "shi"/"chi"/"ji" + i would collide with the plain kana; only y-forms make ぃ.
      const list = prefixes.filter((p) => vowel !== 'i' || p.endsWith('y')).map((p) => p + vowel);
      if (list.length) addCombo(base + small, list);
    }
  }
  const extra: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['てぃ', ['thi']], ['てゅ', ['thu']], ['でぃ', ['dhi']], ['でゅ', ['dhu']],
    ['とぅ', ['twu']], ['どぅ', ['dwu']],
    ['ふぁ', ['fa', 'fwa']], ['ふぃ', ['fi', 'fyi']], ['ふぇ', ['fe', 'fye']],
    ['ふぉ', ['fo', 'fwo']], ['ふゅ', ['fyu']],
    ['うぃ', ['wi', 'whi']], ['うぇ', ['we', 'whe']], ['うぉ', ['who']],
    ['ゔぁ', ['va']], ['ゔぃ', ['vi']], ['ゔぇ', ['ve']], ['ゔぉ', ['vo']], ['ゔゅ', ['vyu']],
    ['つぁ', ['tsa']], ['つぃ', ['tsi']], ['つぇ', ['tse']], ['つぉ', ['tso']],
    ['くぁ', ['qa', 'kwa']], ['くぃ', ['qi']], ['くぇ', ['qe']], ['くぉ', ['qo']],
    ['ぐぁ', ['gwa']], ['すぃ', ['swi']], ['いぇ', ['ye']],
  ];
  for (const [kana, romaji] of extra) addCombo(kana, romaji);
})();

/* ========================================================================== */
/*  Normalization                                                              */
/* ========================================================================== */

/** Katakana → Hiragana (1:1 per character, so indices are preserved). */
export function toHiragana(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // ァ (30A1) … ヶ (30F6) → ぁ (3041) … ゖ (3096)
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : ch;
  }
  return out;
}

/** Full-width ASCII (！-～) → half-width. 1:1 per character. */
function toHalfWidthAscii(ch: string): string {
  const code = ch.charCodeAt(0);
  // keep full-width punctuation that has a dedicated Japanese mapping
  if (ch === '？' || ch === '！' || ch === '，' || ch === '．' || ch === '～') return ch;
  return code >= 0xff01 && code <= 0xff5e ? String.fromCharCode(code - 0xfee0) : ch;
}

/** Normalize a target reading for the engine. Output length === input length. */
export function normalizeReading(reading: string): string {
  let out = '';
  for (const ch of toHiragana(reading)) out += toHalfWidthAscii(ch);
  return out;
}

/** Normalize a physical key (handles accidental full-width input & Caps Lock). */
export function normalizeKey(key: string): string {
  if (key.length !== 1) return key;
  const half = toHalfWidthAscii(key);
  if (half === '？') return '?';
  if (half === '！') return '!';
  if (half === 'ー') return '-';
  return half.toLowerCase();
}

/* ========================================================================== */
/*  Candidate generation                                                       */
/* ========================================================================== */

function prefRank(c: Candidate, prefs: RomajiPrefs): number {
  return prefs[c.kana] === c.romaji ? 0 : 1;
}

function sokuonCandidates(reading: string, i: number, prefs: RomajiPrefs): Candidate[] {
  const doubled: Candidate[] = [];
  if (i + 1 < reading.length) {
    const seen: string[] = [];
    for (const next of getCandidates(reading, i + 1, null, prefs)) {
      const f = next.romaji[0];
      if (!f || !/[a-z]/.test(f) || VOWELS.has(f) || f === 'n' || f === 'x' || f === 'l') continue;
      if (!seen.includes(f)) seen.push(f);
    }
    for (const f of seen) {
      doubled.push({ romaji: f, length: 1, kana: 'っ', constraint: f, sokuon: true });
    }
  }
  const explicit: Candidate[] = SOKUON_EXPLICIT.map((r) => ({ romaji: r, length: 1, kana: 'っ' }));
  explicit.sort((a, b) => prefRank(a, prefs) - prefRank(b, prefs));
  return [...doubled, ...explicit];
}

function hatsuonCandidates(reading: string, i: number, prefs: RomajiPrefs): Candidate[] {
  let singleAllowed = false;
  if (i + 1 < reading.length) {
    const next = getCandidates(reading, i + 1, null, prefs);
    singleAllowed = next.length > 0 && next.every((c) => !"aiueoyn'".includes(c.romaji[0] ?? ''));
  }
  const spellings: string[] = singleAllowed ? ['n', ...HATSUON_BASE] : [...HATSUON_BASE];
  const list: Candidate[] = spellings.map((r) => ({ romaji: r, length: 1, kana: 'ん' }));
  list.sort((a, b) => prefRank(a, prefs) - prefRank(b, prefs));
  return list;
}

/**
 * All valid romaji spellings at kana index `i`, ordered by preference
 * (longer chunks first, then the user's learned spelling, then table order).
 */
export function getCandidates(
  reading: string,
  i: number,
  constraint: string | null,
  prefs: RomajiPrefs = {},
): Candidate[] {
  if (i >= reading.length) return [];
  const ch = reading[i];
  let list: Candidate[];

  if (ch === 'っ') {
    list = sokuonCandidates(reading, i, prefs);
  } else if (ch === 'ん') {
    list = hatsuonCandidates(reading, i, prefs);
  } else {
    list = [];
    const pair = reading.slice(i, i + 2);
    const combo = pair.length === 2 ? COMBO[pair] : undefined;
    if (combo) for (const r of combo) list.push({ romaji: r, length: 2, kana: pair });
    const singles = SINGLE[ch] ?? [ch.toLowerCase()];
    for (const r of singles) list.push({ romaji: r, length: 1, kana: ch });
    list.sort((a, b) => b.length - a.length || prefRank(a, prefs) - prefRank(b, prefs));
  }

  if (constraint) {
    const constrained = list.filter((c) => c.romaji.startsWith(constraint));
    if (constrained.length) list = constrained;
  }
  return list;
}

/* ========================================================================== */
/*  State machine                                                              */
/* ========================================================================== */

export function createParser(reading: string): ParserState {
  const normalized = normalizeReading(reading);
  return {
    source: reading,
    reading: normalized,
    position: 0,
    buffer: '',
    constraint: null,
    history: [],
    completed: normalized.length === 0,
  };
}

function commit(state: ParserState, cand: Candidate): ParserState {
  const chunk: CommittedChunk = {
    start: state.position,
    length: cand.length,
    kana: cand.kana,
    romaji: cand.romaji,
    sokuon: !!cand.sokuon,
  };
  const position = state.position + cand.length;
  return {
    ...state,
    position,
    buffer: '',
    constraint: cand.constraint ?? null,
    history: [...state.history, chunk],
    completed: position >= state.reading.length,
  };
}

function lastChunk(state: ParserState): CommittedChunk {
  return state.history[state.history.length - 1];
}

function step(state: ParserState, key: string, prefs: RomajiPrefs, allowFlush: boolean): KeyResult {
  const rejected: KeyResult = { accepted: false, state, commits: [] };
  const cands = getCandidates(state.reading, state.position, state.constraint, prefs);
  const next = state.buffer + key;
  const matching = cands.filter((c) => c.romaji.startsWith(next));

  if (matching.length === 0) {
    // The buffer may already be a complete (but extendable) spelling — e.g. a
    // single "n" for ん. Commit it and retry the key on the following chunk.
    if (allowFlush && state.buffer) {
      const exact = cands.find((c) => c.romaji === state.buffer);
      if (exact) {
        const flushed = commit(state, exact);
        if (!flushed.completed) {
          const retry = step(flushed, key, prefs, false);
          if (retry.accepted) {
            return { accepted: true, state: retry.state, commits: [lastChunk(flushed), ...retry.commits] };
          }
        }
      }
    }
    return rejected; // block-on-error: cursor stays put
  }

  const exactNow = matching.find((c) => c.romaji === next);
  const hasLonger = matching.some((c) => c.romaji.length > next.length);
  if (exactNow && !hasLonger) {
    const committed = commit({ ...state, buffer: next }, exactNow);
    return { accepted: true, state: committed, commits: [lastChunk(committed)] };
  }
  return { accepted: true, state: { ...state, buffer: next }, commits: [] };
}

/** Feed one physical key into the parser. Pure — returns a new state. */
export function processKey(state: ParserState, rawKey: string, prefs: RomajiPrefs = {}): KeyResult {
  if (state.completed) return { accepted: false, state, commits: [] };
  const key = normalizeKey(rawKey);
  if (key.length !== 1) return { accepted: false, state, commits: [] };
  return step(state, key, prefs, true);
}

/** Convenience: feed a whole string. Returns the final state and number of rejected keys. */
export function typeString(
  reading: string,
  keys: string,
  prefs: RomajiPrefs = {},
): { state: ParserState; errors: number } {
  let state = createParser(reading);
  let errors = 0;
  for (const k of keys) {
    const r = processKey(state, k, prefs);
    if (r.accepted) state = r.state;
    else errors++;
  }
  return { state, errors };
}

/* ========================================================================== */
/*  Live guide                                                                 */
/* ========================================================================== */

/**
 * Plans the remaining romaji chunks from `state.position` up to `limit`
 * (defaults to the end of `state.reading`). The first chunk excludes any
 * characters already in `state.buffer`.
 */
export function planRemaining(
  state: ParserState,
  prefs: RomajiPrefs = {},
  limit: number = state.reading.length,
): PlannedChunk[] {
  const { reading } = state;
  const end = Math.min(limit, reading.length);
  if (state.completed || state.position >= end) return [];

  const chunks: PlannedChunk[] = [];
  const cands = getCandidates(reading, state.position, state.constraint, prefs);
  const matching = cands.filter((c) => c.romaji.startsWith(state.buffer));
  const first = matching[0] ?? cands[0];
  chunks.push({
    start: state.position,
    length: first.length,
    romaji: first.romaji.slice(state.buffer.length),
  });

  let j = state.position + first.length;
  let constraint = first.constraint ?? null;
  while (j < end) {
    const c = getCandidates(reading, j, constraint, prefs)[0];
    if (!c) break;
    chunks.push({ start: j, length: c.length, romaji: c.romaji });
    constraint = c.constraint ?? null;
    j += c.length;
  }
  return chunks;
}

/**
 * Builds the romaji guide: what has been typed, plus the predicted rest of
 * the word following the spelling the user is currently on (e.g. after
 * typing "tosy" the remaining guide becomes "okann" instead of "hokann").
 */
export function getGuide(state: ParserState, prefs: RomajiPrefs = {}): RomajiGuide {
  const typed = state.history.map((h) => h.romaji).join('') + state.buffer;
  const { reading } = state;
  if (state.completed) {
    return { typed, remaining: '', activeStart: reading.length, activeEnd: reading.length };
  }
  const chunks = planRemaining(state, prefs);
  const first = chunks[0];
  return {
    typed,
    remaining: chunks.map((c) => c.romaji).join(''),
    activeStart: state.position,
    activeEnd: state.position + (first?.length ?? 0),
  };
}

/** Default romaji spelling for a reading (useful for previews). */
export function defaultRomaji(reading: string, prefs: RomajiPrefs = {}): string {
  return getGuide(createParser(reading), prefs).remaining;
}
