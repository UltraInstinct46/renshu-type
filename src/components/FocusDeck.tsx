import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CharState, KanaState, QuoteItem, SegmentView, StudySettings } from '../types/typing';
import type { Strings } from '../i18n';
import { IconButton, Label, RestartIcon } from './ui';

/* ============================================================================
 * Focus Deck — the main test card
 *   ┌─ progress edge ───────────────────────────────┐
 *   │ PACK name            ▁▂▃▅▆ 312 キー/分   0:24 ↻│  status header
 *   ├───────────────────────────────────────────────┤
 *   │  [ふりがな]  [ふりがな]  [   ]                 │  manuscript-cell stage
 *   │  [ 漢 字 ]  [ 漢 字 ]  [かな]  …               │  (横書き or 縦書き)
 *   ├───────────────────────────────────────────────┤
 *   │ ROMAJI   tosho|kan                    次 会議 │  romaji dock
 *   └───────────────────────────────────────────────┘
 * ========================================================================== */

export interface FocusDeckProps {
  t: Strings;
  views: SegmentView[];
  study: StudySettings;
  vertical: boolean;
  separator: boolean;
  idle: boolean;
  running: boolean;
  packName: string;
  progress: number;
  counterLabel: string;
  counter: string;
  kpm: number;
  accuracy: number;
  errors: number;
  quote: QuoteItem | null;
  empty: boolean;
  onTap: () => void;
  onRestart: () => void;
  onEditCustom: () => void;
}

export function FocusDeck(props: FocusDeckProps) {
  const { t, views, study, vertical, empty, quote, onTap } = props;
  const current = views.find((v) => v.status === 'current') ?? null;
  const currentIdx = current?.index ?? -1;
  const next = current ? (views[current.index + 1] ?? null) : null;
  const waitingSpace =
    props.separator && !!current && current.romaji.length > 0 && current.romaji.every((r) => r.state !== 'pending');

  return (
    <section className="deck-shadow relative w-full overflow-hidden rounded-2xl border border-line bg-card">
      <ProgressEdge value={props.progress} />
      <DeckHeader {...props} />

      <div onClick={onTap} className="cursor-text">
        {empty ? (
          <EmptyCustom t={t} onAdd={props.onEditCustom} />
        ) : vertical ? (
          <VerticalStage views={views} study={study} currentIdx={currentIdx} />
        ) : (
          <HorizontalStage views={views} study={study} currentIdx={currentIdx} limitRows={!quote} />
        )}

        {quote && !empty && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-4 text-xs sm:px-8">
            <span className="font-mincho text-sm text-accent/90">— {quote.source}</span>
            <span className="italic text-muted">{quote.meaning}</span>
          </div>
        )}
      </div>

      {!empty && (
        <RomajiDock
          t={t}
          view={current}
          next={next}
          showHint={study.showRomaji}
          idle={props.idle}
          waitingSpace={waitingSpace}
          onTap={onTap}
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------- */

function ProgressEdge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="absolute inset-x-0 top-0 z-10 h-[3px] bg-line/50">
      <div className="h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeckHeader({
  t,
  packName,
  running,
  kpm,
  accuracy,
  errors,
  counterLabel,
  counter,
  onRestart,
}: FocusDeckProps) {
  return (
    <header className="flex items-center gap-4 border-b border-line px-5 pb-3 pt-4 sm:gap-6 sm:px-6">
      <div className="min-w-0 flex-1">
        <Label>{t.pack}</Label>
        <div className="mt-0.5 truncate text-sm text-ink">{packName}</div>
      </div>

      <div
        className={`hidden items-baseline gap-4 font-mono text-xs transition-opacity duration-300 md:flex ${
          running ? 'opacity-100' : 'opacity-40'
        }`}
      >
        <div className="text-right">
          <Label>{t.accuracy}</Label>
          <div className="mt-0.5 tabular-nums text-ink">{Math.floor(accuracy)}%</div>
        </div>
        <div className="text-right">
          <Label>{t.errors}</Label>
          <div className={`mt-0.5 tabular-nums ${errors ? 'text-danger' : 'text-ink'}`}>{errors}</div>
        </div>
      </div>

      <KpmGauge value={kpm} active={running} unit={t.kpmUnit} />

      <div className="w-14 text-right sm:w-16">
        <Label>{counterLabel}</Label>
        <div className="mt-0.5 font-mono text-lg tabular-nums text-ink sm:text-xl">{counter}</div>
      </div>

      <IconButton onClick={onRestart} title={t.restart}>
        <RestartIcon />
      </IconButton>
    </header>
  );
}

/** Signal-meter style KPM gauge: 12 ascending bars, full scale ≈ 600 keys/min. */
function KpmGauge({ value, active, unit }: { value: number; active: boolean; unit: string }) {
  const lit = active ? Math.min(12, Math.round(value / 50)) : 0;
  return (
    <div className="flex items-end gap-3">
      <div className="hidden h-7 items-end gap-[3px] sm:flex" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full transition-colors duration-200 ${
              i < lit ? (i >= 9 ? 'bg-accent' : 'bg-ink/85') : 'bg-line'
            }`}
            style={{ height: `${30 + i * 6}%` }}
          />
        ))}
      </div>
      <div className="text-right leading-none">
        <div className="font-mono text-2xl tabular-nums text-ink">{active ? Math.round(value) : '—'}</div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.12em] text-muted">{unit}</div>
      </div>
    </div>
  );
}

function EmptyCustom({ t, onAdd }: { t: Strings; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="font-mincho text-5xl text-line">練習</div>
      <div className="text-sm text-muted">{t.emptyCustom}</div>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        className="rounded-full border border-accent/60 bg-accent/10 px-5 py-2 text-sm text-accent transition-colors hover:bg-accent/20"
      >
        {t.addWords}
      </button>
    </div>
  );
}

/* ============================================================================
 * Stage: manuscript cells
 * ========================================================================== */

/** Render only what can be on screen; time mode queues can be long. */
const visibleViews = (views: SegmentView[], currentIdx: number) => views.slice(0, Math.max(currentIdx, 0) + 48);

function HorizontalStage({
  views,
  study,
  currentIdx,
  limitRows,
}: {
  views: SegmentView[];
  study: StudySettings;
  currentIdx: number;
  limitRows: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState({ scroll: 0, maxH: 0 });

  const measure = useCallback(() => {
    const inner = innerRef.current;
    const first = cellRefs.current[0];
    if (!inner || !first) return;
    const gap = parseFloat(getComputedStyle(inner).rowGap) || 0;
    const rowH = first.offsetHeight + gap;
    const cur = currentIdx >= 0 ? cellRefs.current[currentIdx] : null;
    // Keep the active row on the first or second of three visible rows.
    const scroll = limitRows && cur && cur.offsetTop > rowH * 1.1 ? cur.offsetTop - rowH : 0;
    const maxH = limitRows ? rowH * 3 - gap : 0;
    setLayout((p) => (p.scroll === scroll && p.maxH === maxH ? p : { scroll, maxH }));
  }, [currentIdx, limitRows]);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-7">
      <div className="overflow-hidden" style={layout.maxH ? { maxHeight: layout.maxH } : undefined}>
        <div
          ref={innerRef}
          className="relative flex flex-wrap gap-2 transition-transform duration-200 ease-out"
          style={layout.scroll ? { transform: `translateY(-${layout.scroll}px)` } : undefined}
        >
          {visibleViews(views, currentIdx).map((v) => (
            <Cell
              key={v.index}
              view={v}
              study={study}
              vertical={false}
              cellRef={(el) => {
                cellRefs.current[v.index] = el;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function VerticalStage({
  views,
  study,
  currentIdx,
}: {
  views: SegmentView[];
  study: StudySettings;
  currentIdx: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep the active column in view (columns run right → left).
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const cell = currentIdx >= 0 ? cellRefs.current[currentIdx] : null;
    if (!box || !cell) return;
    const b = box.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const pad = 32;
    if (c.left < b.left + pad) box.scrollBy({ left: c.left - b.left - pad, behavior: 'smooth' });
    else if (c.right > b.right - pad) box.scrollBy({ left: c.right - b.right + pad, behavior: 'smooth' });
  }, [currentIdx]);

  return (
    <div ref={scrollRef} className="tategaki thin-scroll h-[23rem] overflow-x-auto overflow-y-hidden p-6 sm:p-8">
      <div className="flex flex-wrap content-start gap-2">
        {visibleViews(views, currentIdx).map((v) => (
          <Cell
            key={v.index}
            view={v}
            study={study}
            vertical
            cellRef={(el) => {
              cellRefs.current[v.index] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Cell({
  view,
  study,
  vertical,
  cellRef,
}: {
  view: SegmentView;
  study: StudySettings;
  vertical: boolean;
  cellRef: (el: HTMLDivElement | null) => void;
}) {
  const { status } = view;
  const isCurrent = status === 'current';
  const frame = isCurrent
    ? 'border-accent/70 bg-accent/[0.07]'
    : status === 'done'
      ? view.hasError
        ? 'border-danger/45 bg-danger/[0.05]'
        : 'border-line/40'
      : 'border-line bg-surface-alt/40';
  const textColor = status === 'pending' ? 'text-muted' : 'text-ink';

  // In 縦書き the block axis is horizontal (right → left), so the furigana
  // "row" becomes a narrow column to the right of the text — like real ruby.
  const furiSize = vertical ? 'w-4' : 'h-4';
  const textSize = vertical ? 'w-10' : 'h-9 sm:h-10';

  const kana = view.kana.map((k, i) => (
    <span key={i} className={kanaClass(k.state, isCurrent)}>
      {k.ch}
    </span>
  ));

  return (
    <div
      ref={cellRef}
      className={`flex flex-col items-center rounded-md border transition-colors duration-150 ${frame} ${
        vertical ? 'px-1.5 py-2' : 'px-2.5 pb-1.5 pt-1'
      }`}
    >
      {study.showFurigana && (
        <div className={`flex items-center justify-center font-jp text-[11px] leading-none ${furiSize}`}>
          {!view.kanaOnly && kana}
        </div>
      )}
      <div
        className={`flex items-center justify-center font-mincho text-[26px] leading-none sm:text-[28px] ${textSize} ${
          view.kanaOnly ? '' : textColor
        }`}
      >
        {view.kanaOnly ? kana : view.text}
      </div>
    </div>
  );
}

function kanaClass(state: KanaState, inCurrentCell: boolean): string {
  switch (state) {
    case 'done':
      return inCurrentCell ? 'text-accent' : 'text-ink';
    case 'error':
      return 'text-danger';
    case 'missed':
      return 'text-muted/50 line-through decoration-danger/60';
    case 'active':
      return 'text-ink underline decoration-accent decoration-2 underline-offset-4';
    case 'pending':
      return 'text-muted';
  }
}

/* ============================================================================
 * Romaji dock — live input line for the current word
 * ========================================================================== */

function RomajiDock({
  t,
  view,
  next,
  showHint,
  idle,
  waitingSpace,
  onTap,
}: {
  t: Strings;
  view: SegmentView | null;
  next: SegmentView | null;
  showHint: boolean;
  idle: boolean;
  waitingSpace: boolean;
  onTap: () => void;
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [caret, setCaret] = useState({ x: 0, y: 0, h: 0 });

  const chars = view ? (showHint ? view.romaji : view.romaji.filter((r) => r.state !== 'pending')) : [];
  const caretAt = view?.caretAt == null ? chars.length : Math.min(view.caretAt, chars.length);

  useLayoutEffect(() => {
    const el = charRefs.current[caretAt];
    const last = charRefs.current[chars.length - 1];
    let x = 0;
    let y = 0;
    let h = lineRef.current?.clientHeight ?? 36;
    if (el) {
      x = el.offsetLeft;
      y = el.offsetTop;
      h = el.offsetHeight;
    } else if (last) {
      x = last.offsetLeft + last.offsetWidth;
      y = last.offsetTop;
      h = last.offsetHeight;
    }
    setCaret((p) => (p.x === x && p.y === y && p.h === h ? p : { x, y, h }));
  });

  return (
    <div onClick={onTap} className="cursor-text border-t border-line bg-surface-alt/50 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-4">
        <Label className="hidden w-16 shrink-0 sm:block">{t.dock}</Label>

        <div
          ref={lineRef}
          className="relative min-h-9 min-w-0 flex-1 break-all font-mono text-[22px] leading-9 tracking-wide sm:text-2xl"
        >
          {chars.map((r, i) => (
            <span
              key={i}
              ref={(el) => {
                charRefs.current[i] = el;
              }}
              className={charClass(r.state)}
            >
              {r.ch}
            </span>
          ))}
          {waitingSpace && (
            <span className="ml-3 inline-block rounded border border-line px-1.5 align-middle font-mono text-[10px] leading-5 text-muted">
              {t.space} ␣
            </span>
          )}
          <span
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 w-[2px] rounded-full bg-accent transition-transform duration-75 ease-out ${
              idle ? 'animate-caret-blink' : ''
            }`}
            style={{
              transform: `translate(${caret.x - 1}px, ${caret.y + caret.h * 0.15}px)`,
              height: caret.h * 0.7,
            }}
          />
        </div>

        {next && (
          <div className="hidden shrink-0 text-right sm:block">
            <Label>{t.next}</Label>
            <div className="mt-0.5 max-w-40 truncate font-mincho text-base text-muted">{next.text}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function charClass(state: CharState): string {
  switch (state) {
    case 'correct':
      return 'text-ink';
    case 'error':
      return 'rounded-sm bg-danger/20 text-danger';
    case 'extra':
      return 'text-danger/80 underline decoration-danger/60 decoration-wavy';
    case 'missed':
      return 'text-muted/50 line-through';
    case 'pending':
      return 'text-muted/70';
  }
}
