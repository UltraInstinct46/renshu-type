import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { Strings } from '../i18n';
import { materializeReadings, parseCustomWords } from '../utils/customWords';
import { loadTokenizer, readingOf } from '../utils/kanjiReader';
import type { KanjiTokenizer } from '../utils/kanjiReader';
import { defaultRomaji } from '../utils/romajiEngine';
import { Label } from './ui';

const PLACEHOLDER = `猫
図書館
ラーメン屋
猫|neko|cat
ありがとう`;

const PREVIEW_LIMIT = 60;

type DictStatus = 'idle' | 'loading' | 'ready' | 'error';

export function CustomWordsEditor({
  t,
  initialText,
  onSave,
  onClose,
}: {
  t: Strings;
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [dictStatus, setDictStatus] = useState<DictStatus>('idle');
  const [tokenizer, setTokenizer] = useState<KanjiTokenizer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const initialParse = useMemo(() => parseCustomWords(text), [text]);
  const needsDict = initialParse.unresolved.length > 0;

  useEffect(() => {
    if (!needsDict || tokenizer) return;
    let cancelled = false;
    setDictStatus('loading');
    loadTokenizer()
      .then((tok) => {
        if (cancelled) return;
        setTokenizer(tok);
        setDictStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setDictStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [needsDict, tokenizer]);

  const lookup = useMemo(() => {
    if (!tokenizer || initialParse.unresolved.length === 0) return undefined;
    const map = new Map<string, string>();
    for (const word of initialParse.unresolved) {
      map.set(word, readingOf(tokenizer, word) ?? '');
    }
    return map;
  }, [tokenizer, initialParse.unresolved]);

  const parsed = useMemo(() => (lookup ? parseCustomWords(text, lookup) : initialParse), [text, lookup, initialParse]);
  const { words, issues, unresolved } = parsed;

  const handleSave = () => {
    const finalized = lookup ? materializeReadings(text, lookup) : text;
    onSave(finalized);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const content = await file.text();
    setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${content}` : content));
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.editorTitle}
        className="deck-shadow flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-mincho text-xl text-ink">{t.editorTitle}</h2>
            <p className="mt-1 text-xs text-muted">{t.editorHelp}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-[1fr_320px]">
          <textarea
            autoFocus
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            className="h-52 w-full resize-none rounded-xl border border-line bg-surface-alt p-4 font-jp text-sm leading-relaxed text-ink outline-none placeholder:text-muted/50 focus:border-accent/70 md:h-80"
          />

          <div className="flex h-48 min-h-0 flex-col rounded-xl border border-line bg-surface-alt/60 p-3.5 text-sm md:h-80">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <Label>{t.preview}</Label>
              {dictStatus === 'loading' ? (
                <span className="font-mono text-xs text-accent">{t.dictLoading}</span>
              ) : (
                <span className={`font-mono text-xs ${words.length ? 'text-accent' : 'text-muted'}`}>
                  {t.wordsReady(words.length)}
                </span>
              )}
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {words.length === 0 && issues.length === 0 && unresolved.length === 0 && (
                <p className="mt-8 text-center text-xs text-muted/70">{t.typeOrPaste}</p>
              )}
              {dictStatus === 'error' && unresolved.length > 0 && (
                <div className="mb-2 rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                  {t.dictError}
                </div>
              )}
              {words.slice(0, PREVIEW_LIMIT).map((w) => (
                <div key={w.id} className="flex items-baseline gap-2 border-b border-line/60 py-1.5">
                  <span className="font-mincho text-ink">{w.text}</span>
                  {w.text !== w.reading && <span className="font-jp text-xs text-muted">{w.reading}</span>}
                  {w.autoReading && (
                    <span className="rounded border border-accent/35 bg-accent/10 px-1.5 py-px text-[10px] text-accent">
                      {t.auto}
                    </span>
                  )}
                  <span className="ml-auto truncate font-mono text-xs text-muted/80">{defaultRomaji(w.reading)}</span>
                </div>
              ))}
              {words.length > PREVIEW_LIMIT && (
                <p className="py-1 text-xs text-muted">{t.moreWords(words.length - PREVIEW_LIMIT)}</p>
              )}
              {issues.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 font-mono text-xs text-danger">{t.linesSkipped(issues.length)}</div>
                  {issues.slice(0, 20).map((iss) => (
                    <div key={iss.line} className="py-0.5 text-xs">
                      <span className="text-muted">{t.line(iss.line)}</span>
                      <span className="font-jp text-ink">{iss.text}</span>
                      <div className="text-danger/90">{iss.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-alt/40 px-6 py-3 text-xs sm:text-sm">
          <input ref={fileRef} type="file" accept=".txt,.csv,.tsv,text/plain" className="hidden" onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-line px-3.5 py-1.5 text-muted transition-colors hover:border-muted/60 hover:text-ink"
          >
            {t.importFile}
          </button>
          <button
            type="button"
            onClick={() => setText('')}
            className="rounded-full border border-line px-3.5 py-1.5 text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            {t.clear}
          </button>
          <span className="ml-auto hidden font-mono text-[11px] text-muted sm:inline">{t.ctrlEnter}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-4 py-1.5 text-muted transition-colors hover:text-ink"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={dictStatus === 'loading'}
            onClick={handleSave}
            className="rounded-full bg-accent px-5 py-1.5 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {dictStatus === 'loading' ? t.loading : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
