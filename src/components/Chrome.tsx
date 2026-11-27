import type { ReactNode } from 'react';
import type { StudySettings, TestConfig, TestKind, UiLang } from '../types/typing';
import type { QuoteLengthFilter } from '../types/typing';
import type { Strings } from '../i18n';
import { Kbd, Pill, Segmented, TogglePill } from './ui';

const TIME_OPTIONS = [15, 30, 60] as const;
const WORD_OPTIONS = [10, 25, 50] as const;
const QUOTE_OPTIONS: readonly QuoteLengthFilter[] = ['all', 'short', 'medium', 'long'];

/* ============================================================================
 * Header
 * ========================================================================== */

export function Header({ t, dimmed }: { t: Strings; dimmed: boolean }) {
  return (
    <header
      className={`flex items-center justify-between transition-opacity duration-300 ${dimmed ? 'opacity-40' : ''}`}
    >
      <div className="flex select-none items-center gap-3">
        {/* 判子 hanko stamp */}
        <div className="grid h-9 w-9 -rotate-3 place-items-center rounded-[7px] bg-accent font-mincho text-lg font-bold text-surface shadow-[0_2px_10px_-2px] shadow-accent/50">
          練
        </div>
        <div className="leading-tight">
          <div className="font-mono text-lg tracking-tight">
            <span className="text-ink">renshu</span>
            <span className="text-muted">type</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-muted">{t.subtitle}</div>
        </div>
      </div>
      <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-matcha" />
        {t.noIme}
      </div>
    </header>
  );
}

export function ImeBanner({ t, onDismiss }: { t: Strings; onDismiss: () => void }) {
  return (
    <div className="animate-fade-in sticky top-0 z-20 flex items-center justify-center gap-3 border-b border-accent/25 bg-card px-4 py-2 text-xs sm:text-sm">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span className="text-ink">{t.imeDetected}</span>
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

/* ============================================================================
 * Control bar — segmented kind control + pill sub-filters
 * ========================================================================== */

const Sep = () => <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />;

export function ControlBar({
  t,
  config,
  study,
  hidden,
  customCount,
  onConfig,
  onStudy,
  onEditCustom,
}: {
  t: Strings;
  config: TestConfig;
  study: StudySettings;
  hidden: boolean;
  customCount: number;
  onConfig: (patch: Partial<TestConfig>) => void;
  onStudy: (patch: Partial<StudySettings>) => void;
  onEditCustom: () => void;
}) {
  const kinds: readonly (readonly [TestKind, ReactNode])[] = [
    ['words', t.kindWords],
    ['sentences', t.kindSentences],
    ['custom', t.kindCustom],
  ];
  const quoteLabels: Record<QuoteLengthFilter, string> = {
    all: t.lenAll,
    short: t.lenShort,
    medium: t.lenMedium,
    long: t.lenLong,
  };
  const amounts = config.mode === 'time' ? TIME_OPTIONS : WORD_OPTIONS;

  return (
    <div
      className={`flex flex-col items-center gap-3 transition-opacity duration-300 ${
        hidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <Segmented value={config.kind} options={kinds} onChange={(kind) => onConfig({ kind })} />

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {config.kind !== 'sentences' ? (
          <>
            <Pill active={config.mode === 'time'} onClick={() => config.mode !== 'time' && onConfig({ mode: 'time', amount: 30 })}>
              {t.modeTime}
            </Pill>
            <Pill active={config.mode === 'words'} onClick={() => config.mode !== 'words' && onConfig({ mode: 'words', amount: 25 })}>
              {t.modeCount}
            </Pill>
            <Sep />
            {amounts.map((n) => (
              <Pill key={n} active={config.amount === n} onClick={() => onConfig({ amount: n })}>
                {config.mode === 'time' ? t.seconds(n) : t.wordsN(n)}
              </Pill>
            ))}
            {config.kind === 'custom' && (
              <>
                <Sep />
                <Pill active={false} onClick={onEditCustom} title={t.editorTitle}>
                  ✎ {t.edit} <span className="opacity-60">({customCount})</span>
                </Pill>
              </>
            )}
          </>
        ) : (
          <>
            {QUOTE_OPTIONS.map((len) => (
              <Pill key={len} active={config.quoteLength === len} onClick={() => onConfig({ quoteLength: len })}>
                {quoteLabels[len]}
              </Pill>
            ))}
            <Sep />
            <Pill active={study.writing === 'horizontal'} onClick={() => onStudy({ writing: 'horizontal' })}>
              {t.horizontal}
            </Pill>
            <Pill active={study.writing === 'vertical'} onClick={() => onStudy({ writing: 'vertical' })}>
              {t.vertical}
            </Pill>
          </>
        )}
        <Sep />
        <TogglePill on={study.showFurigana} onClick={() => onStudy({ showFurigana: !study.showFurigana })}>
          {t.furigana}
        </TogglePill>
        <TogglePill on={study.showRomaji} onClick={() => onStudy({ showRomaji: !study.showRomaji })}>
          {t.romaji}
        </TogglePill>
      </div>
    </div>
  );
}

/* ============================================================================
 * Footer — key hints + JP / EN toggle
 * ========================================================================== */

export function Footer({
  t,
  lang,
  onLang,
  tabArmed,
  kind,
}: {
  t: Strings;
  lang: UiLang;
  onLang: (lang: UiLang) => void;
  tabArmed: boolean;
  kind: TestKind;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4 text-[11px] text-muted">
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 sm:flex">
        <span className="inline-flex items-center gap-1">
          <Kbd active={tabArmed}>tab</Kbd>+<Kbd>enter</Kbd>
          <span className="ml-1">{t.hintRestart}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>esc</Kbd>
          <span className="ml-1">{t.hintRestart}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>⌫</Kbd>
          <span className="ml-1">{t.hintFix}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>ctrl</Kbd>+<Kbd>⌫</Kbd>
          <span className="ml-1">{t.hintDeleteWord}</span>
        </span>
        {kind !== 'sentences' && (
          <span className="inline-flex items-center gap-1">
            <Kbd>space</Kbd>
            <span className="ml-1">{t.hintNextWord}</span>
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{t.uiLang}</span>
        <Segmented
          size="sm"
          value={lang}
          options={[
            ['ja', 'JP'],
            ['en', 'EN'],
          ]}
          onChange={onLang}
        />
      </div>
    </footer>
  );
}
