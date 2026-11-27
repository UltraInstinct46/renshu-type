import type { ReactNode } from 'react';
import type { QuoteItem, SpeedSample, TestResult } from '../types/typing';
import type { Strings } from '../i18n';
import { Label, RestartIcon } from './ui';

export function Results({
  t,
  result,
  samples,
  packName,
  modeLabel,
  quote,
  isQuote,
  onRestart,
}: {
  t: Strings;
  result: TestResult;
  samples: SpeedSample[];
  packName: string;
  modeLabel: string;
  quote: QuoteItem | null;
  isQuote: boolean;
  onRestart: () => void;
}) {
  return (
    <section className="deck-shadow animate-fade-in relative w-full overflow-hidden rounded-2xl border border-line bg-card">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" />

      <header className="flex items-center justify-between gap-4 border-b border-line px-5 pb-3 pt-4 sm:px-6">
        <div className="min-w-0">
          <Label>{t.results}</Label>
          <div className="mt-0.5 truncate text-sm text-ink">{packName}</div>
        </div>
        <div className="shrink-0 font-mono text-[11px] text-muted">{modeLabel}</div>
      </header>

      <div className="grid gap-6 px-5 py-6 sm:px-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex gap-10 md:flex-col md:gap-5">
          <div>
            <Label>KPM · {t.kpmUnit}</Label>
            <div className="mt-1 font-mono text-6xl leading-none tabular-nums text-accent">{Math.round(result.kpm)}</div>
          </div>
          <div>
            <Label>WPM</Label>
            <div className="mt-1 font-mono text-4xl leading-none tabular-nums text-ink">{result.wpm.toFixed(1)}</div>
          </div>
        </div>
        <SpeedChart samples={samples} t={t} />
      </div>

      {/* manuscript-grid stat cells */}
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label={t.accuracy} value={`${result.accuracy.toFixed(1)}%`} />
        <StatCell label={t.errors} value={result.errors} danger={result.errors > 0} />
        <StatCell label={t.rawKpm} value={Math.round(result.rawKpm)} />
        <StatCell
          label={t.keys}
          value={
            <>
              {result.correctKeys}
              <span className="text-muted">/</span>
              <span className="text-danger">{result.errors}</span>
            </>
          }
        />
        <StatCell label={t.time} value={`${result.durationSec.toFixed(1)}s`} />
        <StatCell
          label={isQuote ? t.kana : t.wordsKana}
          value={isQuote ? result.completedKana : `${result.completedWords} · ${result.completedKana}`}
        />
      </div>

      {quote && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line px-5 py-3 text-xs sm:px-6">
          <span className="font-mincho text-sm text-accent/90">— {quote.source}</span>
          <span className="italic text-muted">{quote.meaning}</span>
        </div>
      )}

      <div className="flex justify-center border-t border-line bg-surface-alt/50 px-6 py-3">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent"
        >
          <RestartIcon /> {isQuote ? t.nextQuote : t.nextTest}
        </button>
      </div>
    </section>
  );
}

function StatCell({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div className="bg-card px-5 py-3">
      <Label>{label}</Label>
      <div className={`mt-1 font-mono text-xl tabular-nums ${danger ? 'text-danger' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

const C = { accent: '#e8603c', muted: '#7a7872', line: '#2e2f34', danger: '#ff5a6e' };

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const step = v > 400 ? 100 : 50;
  return Math.ceil((v * 1.1) / step) * step;
}

function SpeedChart({ samples, t }: { samples: SpeedSample[]; t: Strings }) {
  if (samples.length < 2) {
    return (
      <div className="grid h-44 place-items-center rounded-lg border border-dashed border-line text-xs text-muted">
        {t.notEnoughData}
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
  const x = (v: number) => pad.l + (v / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const line = (key: 'inst' | 'avg') => points.map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Speed over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={C.line} strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.muted} fontFamily="JetBrains Mono">
              {v}
            </text>
          </g>
        ))}
        {points
          .filter((_, i) => points.length <= 20 || i % Math.ceil(points.length / 10) === 0)
          .map((p) => (
            <text key={p.t} x={x(p.t)} y={H - 8} textAnchor="middle" fontSize="10" fill={C.muted} fontFamily="JetBrains Mono">
              {Math.round(p.t)}
            </text>
          ))}
        <polyline points={line('inst')} fill="none" stroke={C.muted} strokeWidth={1.5} strokeLinejoin="round" />
        <polyline points={line('avg')} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" />
        {points
          .filter((p) => p.err > 0)
          .map((p) => (
            <circle key={`e${p.t}`} cx={x(p.t)} cy={y(p.inst)} r={3.5} fill={C.danger} />
          ))}
      </svg>
      <div className="mt-1 flex justify-end gap-4 font-mono text-[10px] text-muted">
        <span>
          <span className="text-accent">━</span> {t.chartAvg}
        </span>
        <span>
          <span className="text-muted">━</span> {t.chartInst}
        </span>
        <span>
          <span className="text-danger">●</span> {t.chartErr}
        </span>
      </div>
    </div>
  );
}
