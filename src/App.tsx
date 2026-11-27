import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  CommittedChunk,
  QuoteItem,
  QuoteLengthFilter,
  RomajiPrefs,
  Segment,
  SpeedSample,
  StudySettings,
  TestConfig,
  TestResult,
  TestStats,
  TestStatus,
  TypingSession,
  WordItem,
} from './types/typing';
import { normalizeKey } from './utils/romajiEngine';
import {
  appendSegments,
  backspace,
  buildSegmentViews,
  createSession,
  currentSegmentIndex,
  deleteWord,
  sessionMetrics,
  typeKey,
} from './utils/typingSession';
import { getQuotePool, WORDS } from './data/wordBanks';
import { parseCustomWords } from './utils/customWords';
import { detectLang, STRINGS } from './i18n';
import type { Strings } from './i18n';
import { ControlBar, Footer, Header, ImeBanner } from './components/Chrome';
import { FocusDeck } from './components/FocusDeck';
import { Results } from './components/Results';
import { CustomWordsEditor } from './components/CustomWordsEditor';

/* ============================================================================
 * Constants & persistence
 * ========================================================================== */

const STORAGE_KEY = 'renshutype:settings:v2';
const LEGACY_STORAGE_KEY = 'kanatype:settings:v2';
const CUSTOM_WORDS_KEY = 'renshutype:custom-words:v1';
const TIME_MODE_BATCH = 50;

const DEFAULT_CONFIG: TestConfig = {
  kind: 'words',
  mode: 'time',
  amount: 30,
  quoteLength: 'all',
};

function defaultStudy(): StudySettings {
  return {
    showFurigana: true,
    showRomaji: true,
    writing: 'horizontal',
    lang: detectLang(),
  };
}

interface SavedSettings {
  config: TestConfig;
  study: StudySettings;
  prefs: RomajiPrefs;
}

function loadSettings(): SavedSettings {
  const baseStudy = defaultStudy();
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedSettings>;
      return {
        config: { ...DEFAULT_CONFIG, ...parsed.config },
        study: { ...baseStudy, ...parsed.study },
        prefs: parsed.prefs ?? {},
      };
    }
  } catch {
    /* ignore corrupted storage */
  }
  return { config: DEFAULT_CONFIG, study: baseStudy, prefs: {} };
}

function loadCustomText(): string {
  try {
    return localStorage.getItem(CUSTOM_WORDS_KEY) ?? '';
  } catch {
    return '';
  }
}

/* ============================================================================
 * Content builders
 * ========================================================================== */

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildWordSegments(pool: readonly WordItem[], count: number, lastText?: string): Segment[] {
  if (pool.length === 0) return [];
  const out: Segment[] = [];
  let prev = lastText;
  while (out.length < count) {
    for (const w of shuffle(pool)) {
      if (out.length >= count) break;
      if (prev && w.text === prev && pool.length > 1) continue;
      out.push({ text: w.text, reading: w.reading });
      prev = w.text;
    }
  }
  return out;
}

function pickQuote(filter: QuoteLengthFilter, previousId?: string): QuoteItem {
  const pool = getQuotePool(filter);
  const candidates = pool.length > 1 && previousId ? pool.filter((q) => q.id !== previousId) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/* ============================================================================
 * Game state (pure reducer)
 * ========================================================================== */

interface GameState {
  config: TestConfig;
  status: TestStatus;
  session: TypingSession;
  quote: QuoteItem | null;
  prefs: RomajiPrefs;
  stats: TestStats;
  startTime: number | null;
  endTime: number | null;
  now: number;
  samples: SpeedSample[];
}

type Action =
  | { type: 'key'; key: string; time: number }
  | { type: 'backspace' }
  | { type: 'deleteWord' }
  | { type: 'tick'; time: number }
  | { type: 'restart'; config: TestConfig; quote: QuoteItem | null; segments: Segment[] }
  | { type: 'append'; segments: Segment[] };

const EMPTY_STATS: TestStats = { correctKeys: 0, errorKeys: 0 };

function createGame(
  config: TestConfig,
  segments: Segment[],
  quote: QuoteItem | null,
  prefs: RomajiPrefs,
): GameState {
  return {
    config,
    status: 'idle',
    session: createSession(segments, config.kind !== 'sentences'),
    quote,
    prefs,
    stats: EMPTY_STATS,
    startTime: null,
    endTime: null,
    now: 0,
    samples: [],
  };
}

const wordPoolFor = (config: TestConfig, custom: readonly WordItem[]) =>
  config.kind === 'custom' ? custom : WORDS;

const isTimed = (config: TestConfig) => config.kind !== 'sentences' && config.mode === 'time';

function initGame(saved: SavedSettings, custom: readonly WordItem[]): GameState {
  const { config, prefs } = saved;
  if (config.kind === 'sentences') {
    const q = pickQuote(config.quoteLength);
    return createGame(config, q.segments, q, prefs);
  }
  const count = config.mode === 'words' ? config.amount : TIME_MODE_BATCH;
  return createGame(config, buildWordSegments(wordPoolFor(config, custom), count), null, prefs);
}

function fillSamples(samples: SpeedSample[], stats: TestStats, elapsed: number): SpeedSample[] {
  const whole = Math.floor(elapsed);
  if (samples.length >= whole) return samples;
  const next = samples.slice();
  while (next.length < whole) {
    next.push({ second: next.length + 1, correct: stats.correctKeys, errors: stats.errorKeys });
  }
  return next;
}

function finish(state: GameState, endTime: number): GameState {
  const start = state.startTime ?? endTime;
  const elapsed = (endTime - start) / 1000;
  let samples = fillSamples(state.samples, state.stats, elapsed);
  const lastSecond = samples.length ? samples[samples.length - 1].second : 0;
  if (elapsed - lastSecond > 0.2) {
    samples = [...samples, { second: elapsed, correct: state.stats.correctKeys, errors: state.stats.errorKeys }];
  }
  return { ...state, status: 'finished', endTime, now: endTime, samples };
}

function learn(prefs: RomajiPrefs, commits: CommittedChunk[]): RomajiPrefs {
  let next = prefs;
  for (const c of commits) {
    if (c.sokuon || c.kana === ' ' || next[c.kana] === c.romaji) continue;
    next = { ...next, [c.kana]: c.romaji };
  }
  return next;
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'restart':
      return createGame(action.config, action.segments, action.quote, state.prefs);

    case 'append':
      return { ...state, session: appendSegments(state.session, action.segments) };

    case 'backspace': {
      if (state.status !== 'running') return state;
      return { ...state, session: backspace(state.session) };
    }

    case 'deleteWord': {
      if (state.status !== 'running') return state;
      return { ...state, session: deleteWord(state.session) };
    }

    case 'tick': {
      if (state.status !== 'running' || state.startTime === null) return state;
      const elapsed = (action.time - state.startTime) / 1000;
      if (isTimed(state.config) && elapsed >= state.config.amount) {
        return finish(state, state.startTime + state.config.amount * 1000);
      }
      return { ...state, now: action.time, samples: fillSamples(state.samples, state.stats, elapsed) };
    }

    case 'key': {
      if (state.status === 'finished') return state;
      const startTime = state.startTime ?? action.time;
      const base: GameState = { ...state, status: 'running', startTime, now: action.time };
      if (isTimed(base.config) && (action.time - startTime) / 1000 >= base.config.amount) {
        return finish(base, startTime + base.config.amount * 1000);
      }

      const res = typeKey(base.session, action.key, base.prefs);
      if (res.outcome === 'ignored') return state;

      const isError = res.outcome === 'error' || res.outcome === 'extra';
      const stats: TestStats = {
        correctKeys: base.stats.correctKeys + (isError ? 0 : 1),
        errorKeys: base.stats.errorKeys + (isError ? 1 : 0),
      };
      const prefs = learn(base.prefs, res.commits);
      const next: GameState = { ...base, session: res.session, prefs, stats };

      if (res.session.parser.completed) {
        return finish(next, action.time);
      }
      return next;
    }
  }
}

function computeResult(state: GameState): TestResult {
  const end = state.status === 'finished' ? state.endTime : state.now;
  const durationSec =
    state.startTime !== null && end !== null ? Math.max((end - state.startTime) / 1000, 0) : 0;
  const minutes = durationSec / 60;
  const { correctKeys, errorKeys } = state.stats;
  const total = correctKeys + errorKeys;
  const { correctChars, uncorrected, completedWords, completedKana } = sessionMetrics(state.session);

  const kpm = minutes > 0 ? correctChars / minutes : 0;
  return {
    kpm,
    wpm: kpm / 5,
    rawKpm: minutes > 0 ? total / minutes : 0,
    accuracy: total > 0 ? (correctKeys / total) * 100 : 100,
    errors: errorKeys,
    uncorrected,
    correctKeys,
    completedWords,
    completedKana,
    durationSec,
  };
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function describePack(config: TestConfig, quote: QuoteItem | null, customCount: number, t: Strings): string {
  if (config.kind === 'sentences') return quote ? quote.source : t.kindSentences;
  if (config.kind === 'custom') return t.packCustom(customCount);
  return t.packWords(WORDS.length);
}

function describeMode(config: TestConfig, study: StudySettings, t: Strings): string {
  if (config.kind === 'sentences') {
    const lenMap: Record<QuoteLengthFilter, string> = {
      all: t.lenAll,
      short: t.lenShort,
      medium: t.lenMedium,
      long: t.lenLong,
    };
    const dir = study.writing === 'vertical' ? t.vertical : t.horizontal;
    return `${t.kindSentences} · ${lenMap[config.quoteLength]} · ${dir}`;
  }
  const kindName = config.kind === 'custom' ? t.kindCustom : t.kindWords;
  const amt = config.mode === 'time' ? t.seconds(config.amount) : t.wordsN(config.amount);
  return `${kindName} · ${amt}`;
}

/* ============================================================================
 * App
 * ========================================================================== */

export default function App() {
  const [saved] = useState(loadSettings);
  const [study, setStudy] = useState<StudySettings>(saved.study);
  const [customText, setCustomText] = useState(loadCustomText);
  const customWords = useMemo(() => parseCustomWords(customText).words, [customText]);
  const customRef = useRef(customWords);
  const [state, dispatch] = useReducer(reducer, saved, (s) => initGame(s, customWords));
  const [imeWarning, setImeWarning] = useState(false);
  const [tabArmed, setTabArmed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const t = STRINGS[study.lang];

  const stateRef = useRef(state);
  const tabRef = useRef(false);
  const editorRef = useRef(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    stateRef.current = state;
    customRef.current = customWords;
    editorRef.current = editorOpen;
  });

  const focusMobileInput = useCallback(() => {
    const el = mobileInputRef.current;
    if (!el) return;
    el.value = ' ';
    el.focus({ preventScroll: true });
    el.setSelectionRange(1, 1);
  }, []);

  const restart = useCallback((nextConfig?: TestConfig) => {
    const cfg = nextConfig ?? stateRef.current.config;
    tabRef.current = false;
    setTabArmed(false);

    if (cfg.kind === 'sentences') {
      const q = pickQuote(cfg.quoteLength, stateRef.current.quote?.id);
      dispatch({ type: 'restart', config: cfg, quote: q, segments: q.segments });
      return;
    }
    const count = cfg.mode === 'words' ? cfg.amount : TIME_MODE_BATCH;
    const pool = wordPoolFor(cfg, customRef.current);
    dispatch({ type: 'restart', config: cfg, quote: null, segments: buildWordSegments(pool, count) });
  }, []);

  const saveCustomWords = (text: string) => {
    customRef.current = parseCustomWords(text).words;
    editorRef.current = false;
    setCustomText(text);
    setEditorOpen(false);
    restart({ ...stateRef.current.config, kind: 'custom' });
  };

  const openEditor = () => {
    editorRef.current = true;
    setEditorOpen(true);
  };

  /* ---- keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const disarm = () => {
      if (tabRef.current) {
        tabRef.current = false;
        setTabArmed(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (editorRef.current) return;
      const fromMobileInput = e.target === mobileInputRef.current;
      if (fromMobileInput && (e.key === 'Unidentified' || e.keyCode === 229)) {
        return;
      }
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        setImeWarning(true);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        restart();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        tabRef.current = true;
        setTabArmed(true);
        return;
      }
      if (e.key === 'Enter') {
        if (tabRef.current) {
          e.preventDefault();
          restart();
        }
        return;
      }

      if (e.key === 'Backspace') {
        disarm();
        e.preventDefault();
        if (e.ctrlKey || e.altKey || e.metaKey) {
          dispatch({ type: 'deleteWord' });
        } else {
          dispatch({ type: 'backspace' });
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      disarm();
      e.preventDefault();
      if (e.repeat) return;
      dispatch({ type: 'key', key: normalizeKey(e.key), time: performance.now() });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restart]);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const raw = el.value;
    el.value = ' ';
    el.setSelectionRange(1, 1);

    if (raw.length === 0) {
      dispatch({ type: 'backspace' });
      return;
    }

    const typed = raw.startsWith(' ') ? raw.slice(1) : raw.endsWith(' ') ? raw.slice(0, -1) : raw;
    if (!typed) return;

    const now = performance.now();
    for (const ch of typed) {
      if (/[^\x00-\x7f]/.test(ch)) {
        setImeWarning(true);
        return;
      }
      dispatch({ type: 'key', key: normalizeKey(ch), time: now });
    }
  };

  /* ---- timer ------------------------------------------------------------- */
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => dispatch({ type: 'tick', time: performance.now() }), 100);
    return () => window.clearInterval(id);
  }, [state.status]);

  /* ---- endless queue for time mode --------------------------------------- */
  useEffect(() => {
    if (!isTimed(state.config)) return;
    const cur = currentSegmentIndex(state.session);
    const total = state.session.segments.length;
    const pool = wordPoolFor(state.config, customWords);
    if (pool.length > 0 && total - cur < 25) {
      const lastText = state.session.segments[total - 1]?.text;
      dispatch({ type: 'append', segments: buildWordSegments(pool, TIME_MODE_BATCH, lastText) });
    }
  }, [state.config, state.session, customWords]);

  /* ---- persistence ------------------------------------------------------- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ config: state.config, study, prefs: state.prefs }));
    } catch {
      /* storage unavailable */
    }
  }, [state.config, state.prefs, study]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_WORDS_KEY, customText);
    } catch {
      /* storage unavailable */
    }
  }, [customText]);

  const updateConfig = (patch: Partial<TestConfig>) => {
    restart({ ...state.config, ...patch });
    if (patch.kind === 'custom' && customWords.length === 0) openEditor();
  };

  const running = state.status === 'running';
  const finished = state.status === 'finished';
  const result = computeResult(state);

  useEffect(() => {
    if (finished) mobileInputRef.current?.blur();
  }, [finished]);

  const views = useMemo(
    () => buildSegmentViews(state.session, state.prefs),
    [state.session, state.prefs],
  );

  const isQuote = state.config.kind === 'sentences';
  const vertical = isQuote && study.writing === 'vertical';
  const packName = describePack(state.config, state.quote, customWords.length, t);
  const modeLabel = describeMode(state.config, study, t);

  const totalKana = state.session.reading.length || 1;
  const progress = isTimed(state.config)
    ? result.durationSec / state.config.amount
    : isQuote
      ? result.completedKana / totalKana
      : result.completedWords / Math.max(1, state.config.amount);

  const counterLabel = isTimed(state.config) ? t.remaining : t.progress;
  const counter = isTimed(state.config)
    ? formatSeconds(state.config.amount - result.durationSec)
    : isQuote
      ? `${result.completedKana}/${state.session.reading.length}`
      : `${result.completedWords}/${state.config.amount}`;

  return (
    <div className="flex min-h-screen flex-col text-ink">
      {imeWarning && <ImeBanner t={t} onDismiss={() => setImeWarning(false)} />}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8">
        <Header t={t} dimmed={running} />

        <ControlBar
          t={t}
          config={state.config}
          study={study}
          hidden={running}
          customCount={customWords.length}
          onConfig={updateConfig}
          onStudy={(patch) => setStudy((s) => ({ ...s, ...patch }))}
          onEditCustom={openEditor}
        />

        <main className="flex flex-1 flex-col justify-center">
          {!finished && !editorOpen && (
            <input
              ref={mobileInputRef}
              type="text"
              defaultValue=" "
              onChange={handleMobileChange}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-label="Type romaji here"
              className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
            />
          )}

          {finished ? (
            <Results
              t={t}
              result={result}
              samples={state.samples}
              packName={packName}
              modeLabel={modeLabel}
              quote={state.quote}
              isQuote={isQuote}
              onRestart={() => restart()}
            />
          ) : (
            <div className="flex flex-col items-center">
              <FocusDeck
                t={t}
                views={views}
                study={study}
                vertical={vertical}
                separator={state.session.separator}
                idle={state.status === 'idle'}
                running={running}
                packName={packName}
                progress={progress}
                counterLabel={counterLabel}
                counter={counter}
                kpm={result.durationSec >= 0.8 ? result.kpm : 0}
                accuracy={result.accuracy}
                errors={result.errors}
                quote={state.quote}
                empty={state.session.segments.length === 0}
                onTap={focusMobileInput}
                onRestart={() => restart()}
                onEditCustom={openEditor}
              />

              {!inputFocused && state.session.segments.length > 0 && (
                <button
                  type="button"
                  onClick={focusMobileInput}
                  className="mt-3 rounded-full border border-line bg-card px-4 py-1.5 text-xs text-muted transition-colors hover:text-accent sm:hidden"
                >
                  {t.tapToType}
                </button>
              )}

              {state.status === 'idle' && state.session.segments.length > 0 && (
                <p className="mt-3 hidden text-center text-xs text-muted sm:block">
                  {isQuote ? t.idleQuote : t.idleWords}
                </p>
              )}
            </div>
          )}
        </main>

        <Footer
          t={t}
          lang={study.lang}
          onLang={(lang) => setStudy((s) => ({ ...s, lang }))}
          tabArmed={tabArmed}
          kind={state.config.kind}
        />
      </div>

      {editorOpen && (
        <CustomWordsEditor
          t={t}
          initialText={customText}
          onSave={saveCustomWords}
          onClose={() => {
            editorRef.current = false;
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}
