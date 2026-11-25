import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CommittedChunk,
  QuoteItem,
  QuoteLengthFilter,
  RomajiPrefs,
  Segment,
  SegmentView,
  SpeedSample,
  StudySettings,
  TestConfig,
  TestResult,
  TestStats,
  TestStatus,
  TypingSession,
} from './types/typing';
import { normalizeKey } from './utils/romajiEngine';
import {
  appendSegments,
  backspace,
  buildSegmentViews,
  currentSegmentIndex,
  sessionMetrics,
  typeKey,
  createSession,
} from './utils/typingSession';
import { getQuotePool, QUOTE_LENGTH_LABELS, WORDS } from './data/wordBanks';

/* ============================================================================
 * Constants & persistence
 * ========================================================================== */

const TIME_OPTIONS = [15, 30, 60] as const;
const WORD_OPTIONS = [10, 25, 50] as const;
const QUOTE_OPTIONS: readonly QuoteLengthFilter[] = ['all', 'short', 'medium', 'long'];
const STORAGE_KEY = 'kanatype:settings:v2';
const TIME_MODE_BATCH = 50;

const DEFAULT_CONFIG: TestConfig = {
  kind: 'words',
  mode: 'time',
  amount: 30,
  quoteLength: 'all',
};
const DEFAULT_STUDY: StudySettings = { showFurigana: true, showRomaji: true };

interface SavedSettings {
  config: TestConfig;
  study: StudySettings;
  prefs: RomajiPrefs;
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedSettings>;
      return {
        config: { ...DEFAULT_CONFIG, ...parsed.config },
        study: { ...DEFAULT_STUDY, ...parsed.study },
        prefs: parsed.prefs ?? {},
      };
    }
  } catch {
    /* ignore corrupted storage */
  }
  return { config: DEFAULT_CONFIG, study: DEFAULT_STUDY, prefs: {} };
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

function buildWordSegments(count: number, lastText?: string): Segment[] {
  const out: Segment[] = [];
  let prev = lastText;
  while (out.length < count) {
    for (const w of shuffle(WORDS)) {
      if (out.length >= count) break;
      if (prev && w.text === prev && WORDS.length > 1) continue;
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
    session: createSession(segments, config.kind === 'words'),
    quote,
    prefs,
    stats: EMPTY_STATS,
    startTime: null,
    endTime: null,
    now: 0,
    samples: [],
  };
}

function initGame(saved: SavedSettings): GameState {
  const { config, prefs } = saved;
  if (config.kind === 'sentences') {
    const q = pickQuote(config.quoteLength);
    return createGame(config, q.segments, q, prefs);
  }
  const count = config.mode === 'words' ? config.amount : TIME_MODE_BATCH;
  return createGame(config, buildWordSegments(count), null, prefs);
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

    case 'tick': {
      if (state.status !== 'running' || state.startTime === null) return state;
      const elapsed = (action.time - state.startTime) / 1000;
      if (state.config.kind === 'words' && state.config.mode === 'time' && elapsed >= state.config.amount) {
        return finish(state, state.startTime + state.config.amount * 1000);
      }
      return { ...state, now: action.time, samples: fillSamples(state.samples, state.stats, elapsed) };
    }

    case 'key': {
      if (state.status === 'finished') return state;
      const startTime = state.startTime ?? action.time;
      const base: GameState = { ...state, status: 'running', startTime, now: action.time };
      if (base.config.kind === 'words' && base.config.mode === 'time' && (action.time - startTime) / 1000 >= base.config.amount) {
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

/* ============================================================================
 * App
 * ========================================================================== */

export default function App() {
  const [saved] = useState(loadSettings);
  const [study, setStudy] = useState<StudySettings>(saved.study);
  const [state, dispatch] = useReducer(reducer, saved, initGame);
  const [imeWarning, setImeWarning] = useState(false);
  const [tabArmed, setTabArmed] = useState(false);

  const stateRef = useRef(state);
  const tabRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  });

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
    dispatch({ type: 'restart', config: cfg, quote: null, segments: buildWordSegments(count) });
  }, []);

  /* ---- keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const disarm = () => {
      if (tabRef.current) {
        tabRef.current = false;
        setTabArmed(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
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
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Backspace') {
        disarm();
        e.preventDefault();
        dispatch({ type: 'backspace' });
        return;
      }

      if (e.key.length !== 1) return;
      disarm();
      e.preventDefault();
      if (e.repeat) return;
      dispatch({ type: 'key', key: normalizeKey(e.key), time: performance.now() });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restart]);

  /* ---- timer ------------------------------------------------------------- */
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => dispatch({ type: 'tick', time: performance.now() }), 100);
    return () => window.clearInterval(id);
  }, [state.status]);

  /* ---- endless queue for time mode --------------------------------------- */
  useEffect(() => {
    if (state.config.kind !== 'words' || state.config.mode !== 'time') return;
    const cur = currentSegmentIndex(state.session);
    const total = state.session.segments.length;
    if (total - cur < 25) {
      const lastText = state.session.segments[total - 1]?.text;
      dispatch({ type: 'append', segments: buildWordSegments(TIME_MODE_BATCH, lastText) });
    }
  }, [state.config, state.session]);

  /* ---- persistence ------------------------------------------------------- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ config: state.config, study, prefs: state.prefs }));
    } catch {
      /* storage unavailable */
    }
  }, [state.config, state.prefs, study]);

  const updateConfig = (patch: Partial<TestConfig>) => restart({ ...state.config, ...patch });

  const running = state.status === 'running';
  const finished = state.status === 'finished';
  const result = computeResult(state);

  return (
    <div className="min-h-screen bg-surface text-ink font-mono flex flex-col">
      {imeWarning && <ImeBanner onDismiss={() => setImeWarning(false)} />}

      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col px-6 py-8">
        <Header dimmed={running} />

        <ConfigBar
          config={state.config}
          study={study}
          hidden={running}
          onConfig={updateConfig}
          onStudy={(patch) => setStudy((s) => ({ ...s, ...patch }))}
        />

        <main className="flex-1 flex flex-col justify-center py-8">
          {finished ? (
            <Results
              result={result}
              samples={state.samples}
              config={state.config}
              quote={state.quote}
              onRestart={() => restart()}
            />
          ) : (
            <TestView state={state} study={study} result={result} onRestart={() => restart()} />
          )}
        </main>

        <Footer tabArmed={tabArmed} kind={state.config.kind} />
      </div>
    </div>
  );
}

/* ============================================================================
 * Chrome: header, banner, config bar, footer
 * ========================================================================== */

function Header({ dimmed }: { dimmed: boolean }) {
  return (
    <header className={`flex items-center justify-between transition-opacity duration-300 ${dimmed ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-3 select-none">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface-alt font-jp text-xl font-bold text-accent">
          か
        </div>
        <div className="leading-tight">
          <div className="text-2xl font-bold tracking-tight text-ink">
            kana<span className="text-accent">type</span>
          </div>
          <div className="font-jp text-[10px] tracking-[0.35em] text-muted">ローマ字タイピング</div>
        </div>
      </div>
      <div className="hidden text-xs text-muted sm:block">no IME required · qwerty</div>
    </header>
  );
}

function ImeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="animate-fade-in sticky top-0 z-20 flex items-center justify-center gap-4 border-b border-accent/20 bg-surface-alt px-4 py-2 text-sm">
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <span className="text-ink">
        Japanese IME detected — switch to direct input (
        <span className="font-jp text-accent">英数</span> / <span className="text-accent">A</span>). kanatype converts
        romaji to kana by itself.
      </span>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDismiss}
        className="rounded px-2 text-muted transition-colors hover:text-ink"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function ConfigButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2.5 py-1 transition-colors duration-150 ${
        active ? 'text-accent' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-[3px] rounded bg-surface" />;

function ConfigBar({
  config,
  study,
  hidden,
  onConfig,
  onStudy,
}: {
  config: TestConfig;
  study: StudySettings;
  hidden: boolean;
  onConfig: (patch: Partial<TestConfig>) => void;
  onStudy: (patch: Partial<StudySettings>) => void;
}) {
  const amounts = config.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;

  return (
    <div
      className={`mt-6 flex justify-center transition-opacity duration-300 ${
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-y-1 rounded-lg bg-surface-alt px-3 py-1.5 text-sm">
        <ConfigButton
          active={study.showFurigana}
          onClick={() => onStudy({ showFurigana: !study.showFurigana })}
          title="Toggle furigana"
        >
          <span className="font-jp">ふりがな</span>
        </ConfigButton>
        <ConfigButton
          active={study.showRomaji}
          onClick={() => onStudy({ showRomaji: !study.showRomaji })}
          title="Toggle romaji hint"
        >
          romaji
        </ConfigButton>

        <Divider />

        <ConfigButton
          active={config.kind === 'words'}
          onClick={() => config.kind !== 'words' && onConfig({ kind: 'words' })}
        >
          words
        </ConfigButton>
        <ConfigButton
          active={config.kind === 'sentences'}
          onClick={() => config.kind !== 'sentences' && onConfig({ kind: 'sentences' })}
        >
          sentences
        </ConfigButton>

        <Divider />

        {config.kind === 'words' ? (
          <>
            <ConfigButton
              active={config.mode === 'time'}
              onClick={() => config.mode !== 'time' && onConfig({ mode: 'time', amount: 30 })}
            >
              time
            </ConfigButton>
            <ConfigButton
              active={config.mode === 'words'}
              onClick={() => config.mode !== 'words' && onConfig({ mode: 'words', amount: 25 })}
            >
              count
            </ConfigButton>
            <Divider />
            {amounts.map((n) => (
              <ConfigButton key={n} active={config.amount === n} onClick={() => onConfig({ amount: n })}>
                {n}
              </ConfigButton>
            ))}
          </>
        ) : (
          QUOTE_OPTIONS.map((len) => (
            <ConfigButton
              key={len}
              active={config.quoteLength === len}
              onClick={() => onConfig({ quoteLength: len })}
            >
              {QUOTE_LENGTH_LABELS[len]}
            </ConfigButton>
          ))
        )}
      </div>
    </div>
  );
}

function Kbd({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <kbd
      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
        active ? 'bg-accent text-surface' : 'bg-surface-alt text-ink'
      }`}
    >
      {children}
    </kbd>
  );
}

function Footer({ tabArmed, kind }: { tabArmed: boolean; kind: TestConfig['kind'] }) {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
      <span>
        <Kbd active={tabArmed}>tab</Kbd> + <Kbd>enter</Kbd> — {kind === 'sentences' ? 'next quote' : 'restart'}
      </span>
      <span>
        <Kbd>esc</Kbd> — restart
      </span>
      <span>
        <Kbd>backspace</Kbd> — fix typo
      </span>
      {kind === 'words' && (
        <span>
          <Kbd>space</Kbd> — next word
        </span>
      )}
    </footer>
  );
}

/* ============================================================================
 * Test view: multi-word stream & quotes
 * ========================================================================== */

function TestView({
  state,
  study,
  result,
  onRestart,
}: {
  state: GameState;
  study: StudySettings;
  result: TestResult;
  onRestart: () => void;
}) {
  const views = useMemo(
    () => buildSegmentViews(state.session, state.prefs),
    [state.session, state.prefs],
  );
  const running = state.status === 'running';
  const elapsed = result.durationSec;

  const counter =
    state.config.kind === 'words'
      ? state.config.mode === 'time'
        ? String(Math.max(0, Math.ceil(state.config.amount - elapsed)))
        : `${result.completedWords}/${state.config.amount}`
      : `${result.completedKana}/${state.session.reading.length}`;

  return (
    <div className="flex flex-col items-center">
      {/* live stats */}
      <div className="mb-6 flex h-10 w-full items-baseline gap-6 text-muted">
        <span className="text-3xl font-medium text-accent tabular-nums">{counter}</span>
        <div
          className={`flex items-baseline gap-5 text-sm transition-opacity duration-300 ${
            running ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <LiveStat label="kpm" value={elapsed >= 1 ? Math.round(result.kpm) : '–'} />
          <LiveStat label="wpm" value={elapsed >= 1 ? result.wpm.toFixed(0) : '–'} />
          <LiveStat label="acc" value={`${Math.floor(result.accuracy)}%`} />
          <LiveStat label="err" value={result.errors} />
        </div>
      </div>

      <WordStream
        views={views}
        study={study}
        isQuote={state.config.kind === 'sentences'}
        idle={state.status === 'idle'}
      />

      {state.quote && (
        <div className="mt-6 flex flex-col items-center gap-1 text-center">
          <div className="font-jp text-sm text-accent/80">— {state.quote.source}</div>
          <div className="text-xs text-muted/75 italic">{state.quote.meaning}</div>
        </div>
      )}

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRestart}
        title={state.config.kind === 'sentences' ? 'Next quote (esc)' : 'Restart test (esc)'}
        className="mt-8 rounded-lg p-3 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
      >
        <RestartIcon />
      </button>

      {state.status === 'idle' && (
        <p className="mt-2 text-xs text-muted/80">
          {state.config.kind === 'words'
            ? 'type the romaji and press space between words — typos can be backspaced'
            : 'type the quote in romaji — typos can be backspaced'}
        </p>
      )}
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span>
      <span className="text-lg text-ink tabular-nums">{value}</span> <span className="text-xs">{label}</span>
    </span>
  );
}

function WordStream({
  views,
  study,
  isQuote,
  idle,
}: {
  views: SegmentView[];
  study: StudySettings;
  isQuote: boolean;
  idle: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const caretCharRef = useRef<HTMLSpanElement | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [caret, setCaret] = useState({ x: 0, y: 0, h: 0, visible: false });

  const currentSeg = views.find((v) => v.status === 'current');
  const currentIdx = currentSeg?.index ?? -1;

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scroll so the active row stays on row 1 or 2 (Monkeytype 3-line window)
    let nextScroll = 0;
    const segEl = currentIdx >= 0 ? segRefs.current[currentIdx] : null;
    if (!isQuote && segEl) {
      const rowH = segEl.offsetHeight + 12; // segment height + gap-y-3 (12px)
      if (segEl.offsetTop > rowH * 1.1) {
        nextScroll = Math.max(0, segEl.offsetTop - rowH);
      }
    }
    setScrollY((prev) => (prev === nextScroll ? prev : nextScroll));

    // 2. Position caret on the active romaji character
    const target = caretCharRef.current;
    if (!target) {
      setCaret((c) => (c.visible ? { ...c, visible: false } : c));
      return;
    }
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const x = tRect.left - cRect.left;
    const y = tRect.top - cRect.top;
    const h = tRect.height || 16;
    setCaret((prev) =>
      Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 && Math.abs(prev.h - h) < 0.5 && prev.visible
        ? prev
        : { x, y, h, visible: true },
    );
  }, [currentIdx, isQuote]);

  useLayoutEffect(() => {
    measure();
  }, [measure, views, study, scrollY]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Show 3 rows in words mode; full quote in sentences mode
  const maxHeightClass = isQuote
    ? 'max-w-3xl mx-auto'
    : study.showFurigana
      ? 'max-h-[240px] overflow-hidden'
      : 'max-h-[192px] overflow-hidden';

  return (
    <div className={`relative w-full ${maxHeightClass}`}>
      <div
        ref={containerRef}
        className={`relative flex flex-wrap items-start transition-transform duration-150 ease-out ${
          isQuote ? 'justify-start gap-x-1 gap-y-3' : 'justify-start gap-x-4 gap-y-3'
        }`}
        style={scrollY > 0 ? { transform: `translateY(-${scrollY}px)` } : undefined}
      >
        {views.map((seg) => (
          <SegmentBlock
            key={seg.index}
            seg={seg}
            study={study}
            segRef={(el) => {
              segRefs.current[seg.index] = el;
            }}
            caretCharRef={seg.status === 'current' ? caretCharRef : undefined}
          />
        ))}

        {caret.visible && (
          <span
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 w-[2px] rounded-full bg-accent transition-transform duration-75 ease-out ${
              idle ? 'animate-caret-blink' : ''
            }`}
            style={{
              transform: `translate(${caret.x - 1}px, ${caret.y + caret.h * 0.05}px)`,
              height: caret.h * 0.9,
            }}
          />
        )}
      </div>
    </div>
  );
}

function SegmentBlock({
  seg,
  study,
  segRef,
  caretCharRef,
}: {
  seg: SegmentView;
  study: StudySettings;
  segRef: (el: HTMLDivElement | null) => void;
  caretCharRef?: React.MutableRefObject<HTMLSpanElement | null>;
}) {
  const textColor =
    seg.status === 'done'
      ? seg.hasError
        ? 'text-ink/80'
        : 'text-ink'
      : seg.status === 'current'
        ? 'text-ink'
        : 'text-muted';

  const visibleRomaji = study.showRomaji
    ? seg.romaji
    : seg.romaji.filter((r) => r.state !== 'pending');
  const caretIdx = seg.caretAt === null ? null : Math.min(seg.caretAt, visibleRomaji.length);

  return (
    <div
      ref={segRef}
      className={`inline-flex flex-col items-center select-none ${
        seg.hasError ? 'border-b-2 border-danger/70 pb-0.5' : 'pb-1'
      }`}
    >
      {/* Tier 1: Kanji / Kana (uniform h-9 across all segments) */}
      {seg.kanaOnly ? (
        <div className="flex h-9 items-center justify-center font-jp text-2xl leading-none">
          {seg.kana.map((k, i) => (
            <span key={i} className={kanaColorClass(k.state)}>
              {k.ch}
            </span>
          ))}
        </div>
      ) : (
        <div className={`flex h-9 items-center justify-center font-jp text-2xl leading-none transition-colors ${textColor}`}>
          {seg.text}
        </div>
      )}

      {/* Tier 2: Furigana (uniform h-4 when enabled, even for kana-only segments) */}
      {study.showFurigana && (
        <div className="flex h-4 items-center justify-center font-jp text-[11px] leading-none">
          {!seg.kanaOnly &&
            seg.kana.map((k, i) => (
              <span key={i} className={kanaColorClass(k.state)}>
                {k.ch}
              </span>
            ))}
        </div>
      )}

      {/* Tier 3: Romaji (uniform h-5) */}
      <div className="flex h-5 items-center justify-center font-mono text-xs leading-none tracking-normal">
        {visibleRomaji.map((r, i) => {
          const isCaretTarget = caretIdx === i;
          return (
            <span
              key={i}
              ref={isCaretTarget ? caretCharRef : undefined}
              className={romajiColorClass(r.state, study.showRomaji)}
            >
              {r.ch}
            </span>
          );
        })}
        {caretIdx === visibleRomaji.length && (
          <span ref={caretCharRef} className="inline-block h-3.5 w-0">
            &#8203;
          </span>
        )}
      </div>
    </div>
  );
}

function kanaColorClass(state: SegmentView['kana'][number]['state']): string {
  switch (state) {
    case 'done':
      return 'text-accent';
    case 'error':
      return 'text-danger';
    case 'missed':
      return 'text-muted/45';
    case 'active':
      return 'text-ink border-b border-accent';
    case 'pending':
      return 'text-muted';
  }
}

function romajiColorClass(state: SegmentView['romaji'][number]['state'], showHint: boolean): string {
  switch (state) {
    case 'correct':
      return 'text-ink';
    case 'error':
      return 'text-danger';
    case 'extra':
      return 'text-danger/80 underline decoration-danger/60';
    case 'missed':
      return 'text-muted/45';
    case 'pending':
      return showHint ? 'text-muted' : 'text-transparent';
  }
}

function RestartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

/* ============================================================================
 * Results
 * ========================================================================== */

function Results({
  result,
  samples,
  config,
  quote,
  onRestart,
}: {
  result: TestResult;
  samples: SpeedSample[];
  config: TestConfig;
  quote: QuoteItem | null;
  onRestart: () => void;
}) {
  const modeLabel =
    config.kind === 'words'
      ? `words · ${config.mode} ${config.amount}${config.mode === 'time' ? 's' : ''}`
      : `sentences · ${QUOTE_LENGTH_LABELS[config.quoteLength]}`;

  return (
    <div className="animate-fade-in flex flex-col gap-10">
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex gap-10 md:flex-col md:gap-6">
          <BigStat label="kpm" value={Math.round(result.kpm)} />
          <BigStat label="wpm" value={result.wpm.toFixed(1)} />
        </div>
        <SpeedChart samples={samples} />
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <SmallStat label="accuracy" value={`${result.accuracy.toFixed(1)}%`} />
        <SmallStat label="errors" value={result.errors} danger={result.errors > 0} />
        <SmallStat label="raw kpm" value={Math.round(result.rawKpm)} />
        <SmallStat
          label="keys"
          value={
            <>
              {result.correctKeys}
              <span className="text-muted">/</span>
              <span className="text-danger">{result.errors}</span>
            </>
          }
        />
        <SmallStat label="time" value={`${result.durationSec.toFixed(1)}s`} />
        <SmallStat
          label={config.kind === 'sentences' ? 'kana' : 'words · kana'}
          value={config.kind === 'sentences' ? result.completedKana : `${result.completedWords} · ${result.completedKana}`}
        />
      </div>

      {quote && (
        <div className="rounded-lg bg-surface-alt/60 px-5 py-3 text-center">
          <div className="font-jp text-sm text-accent">— {quote.source}</div>
          <div className="mt-1 text-xs text-muted italic">{quote.meaning}</div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <div className="text-xs text-muted">{modeLabel}</div>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRestart}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
        >
          <RestartIcon /> {config.kind === 'sentences' ? 'next quote' : 'next test'}
        </button>
      </div>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-2xl text-muted">{label}</div>
      <div className="text-6xl leading-none text-accent tabular-nums">{value}</div>
    </div>
  );
}

function SmallStat({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-2xl tabular-nums ${danger ? 'text-danger' : 'text-accent'}`}>{value}</div>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const step = v > 400 ? 100 : 50;
  return Math.ceil((v * 1.1) / step) * step;
}

function SpeedChart({ samples }: { samples: SpeedSample[] }) {
  if (samples.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-lg bg-surface-alt/50 text-sm text-muted">
        not enough data for a chart
      </div>
    );
  }

  const W = 640;
  const H = 200;
  const pad = { l: 40, r: 12, t: 12, b: 26 };

  const raw = samples.map((s, i) => {
    const prev = i === 0 ? { second: 0, correct: 0, errors: 0 } : samples[i - 1];
    const dt = s.second - prev.second || 1;
    return {
      t: s.second,
      inst: ((s.correct - prev.correct) / dt) * 60,
      avg: (s.correct / s.second) * 60,
      err: s.errors - prev.errors,
    };
  });
  const points = raw.map((p, i) => {
    const win = raw.slice(Math.max(0, i - 1), i + 2);
    return { ...p, inst: win.reduce((n, q) => n + q.inst, 0) / win.length };
  });

  const maxT = points[points.length - 1].t;
  const maxY = niceMax(Math.max(...points.map((p) => Math.max(p.inst, p.avg))));
  const x = (t: number) => pad.l + (t / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const line = (key: 'inst' | 'avg') => points.map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Speed over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#646669" strokeOpacity={0.18} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#646669">
              {v}
            </text>
          </g>
        ))}
        {points
          .filter((_, i) => points.length <= 20 || i % Math.ceil(points.length / 10) === 0)
          .map((p) => (
            <text key={p.t} x={x(p.t)} y={H - 8} textAnchor="middle" fontSize="10" fill="#646669">
              {Math.round(p.t)}
            </text>
          ))}
        <polyline points={line('inst')} fill="none" stroke="#646669" strokeWidth={2} strokeLinejoin="round" />
        <polyline points={line('avg')} fill="none" stroke="#e2b714" strokeWidth={2.5} strokeLinejoin="round" />
        {points
          .filter((p) => p.err > 0)
          .map((p) => (
            <g key={`e${p.t}`} stroke="#ca4754" strokeWidth={2}>
              <line x1={x(p.t) - 4} x2={x(p.t) + 4} y1={y(p.inst) - 4} y2={y(p.inst) + 4} />
              <line x1={x(p.t) - 4} x2={x(p.t) + 4} y1={y(p.inst) + 4} y2={y(p.inst) - 4} />
            </g>
          ))}
      </svg>
      <div className="mt-1 flex justify-end gap-4 text-xs text-muted">
        <span>
          <span className="text-accent">━</span> avg kpm
        </span>
        <span>
          <span className="text-muted">━</span> kpm / sec
        </span>
        <span>
          <span className="text-danger">✕</span> errors
        </span>
      </div>
    </div>
  );
}
