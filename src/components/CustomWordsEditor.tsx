import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { materializeReadings, parseCustomWords } from '../utils/customWords';
import { loadTokenizer, readingOf } from '../utils/kanjiReader';
import type { KanjiTokenizer } from '../utils/kanjiReader';
import { defaultRomaji } from '../utils/romajiEngine';

const PLACEHOLDER = `猫
図書館
ラーメン屋
猫|neko|cat
ありがとう`;

const PREVIEW_LIMIT = 60;

type DictStatus = 'idle' | 'loading' | 'ready' | 'error';

export function CustomWordsEditor({
  initialText,
  onSave,
  onClose,
}: {
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [dictStatus, setDictStatus] = useState<DictStatus>('idle');
  const [tokenizer, setTokenizer] = useState<KanjiTokenizer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // First pass without lookup to see if any kanji-only lines need the dictionary
  const initialParse = useMemo(() => parseCustomWords(text), [text]);
  const needsDict = initialParse.unresolved.length > 0;

  useEffect(() => {
    if (!needsDict || tokenizer || dictStatus === 'loading' || dictStatus === 'error') return;
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
  }, [needsDict, tokenizer, dictStatus]);

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
    setText((t) => (t.trim() ? `${t.trimEnd()}\n${content}` : content));
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Custom words"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 rounded-xl bg-surface p-6 shadow-2xl ring-1 ring-white/5"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-xl text-ink">
              custom <span className="text-accent">words</span>
            </h2>
            <p className="mt-1 text-xs text-muted">
              one per line · kanji alone (<span className="font-jp text-ink">猫</span>) auto-reads · or{' '}
              <span className="font-jp text-ink">言葉|ことば|meaning</span> /{' '}
              <span className="font-jp text-ink">猫|neko</span> · <span className="text-ink">#</span> comments
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_320px]">
          <textarea
            autoFocus
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            className="h-80 w-full resize-none rounded-lg bg-surface-alt p-4 font-jp text-sm leading-relaxed text-ink outline-none ring-accent/40 placeholder:text-muted/50 focus:ring-1"
          />

          <div className="flex h-80 min-h-0 flex-col rounded-lg bg-surface-alt/60 p-3 text-sm">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-muted">preview</span>
              {dictStatus === 'loading' ? (
                <span className="text-xs text-accent">loading dictionary…</span>
              ) : (
                <span className={words.length ? 'text-accent' : 'text-muted'}>
                  {words.length} word{words.length === 1 ? '' : 's'} ready
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {words.length === 0 && issues.length === 0 && unresolved.length === 0 && (
                <p className="mt-6 text-center text-xs text-muted/70">type or paste words on the left</p>
              )}
              {dictStatus === 'error' && unresolved.length > 0 && (
                <div className="mb-2 rounded bg-danger/15 p-2 text-xs text-danger">
                  couldn&apos;t load dictionary — add readings manually like <span className="font-jp">猫|ねこ</span>
                </div>
              )}
              {words.slice(0, PREVIEW_LIMIT).map((w) => (
                <div key={w.id} className="flex items-baseline gap-2 border-b border-white/5 py-1">
                  <span className="font-jp text-ink">{w.text}</span>
                  {w.text !== w.reading && <span className="font-jp text-xs text-muted">{w.reading}</span>}
                  {w.autoReading && (
                    <span className="rounded bg-surface px-1 text-[10px] text-accent/80" title="auto-detected reading">
                      auto
                    </span>
                  )}
                  <span className="ml-auto truncate font-mono text-xs text-muted/80">{defaultRomaji(w.reading)}</span>
                </div>
              ))}
              {words.length > PREVIEW_LIMIT && (
                <p className="py-1 text-xs text-muted">…and {words.length - PREVIEW_LIMIT} more</p>
              )}
              {issues.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-danger">
                    {issues.length} line{issues.length === 1 ? '' : 's'} skipped
                  </div>
                  {issues.slice(0, 20).map((iss) => (
                    <div key={iss.line} className="py-0.5 text-xs">
                      <span className="text-muted">line {iss.line}: </span>
                      <span className="font-jp text-ink">{iss.text}</span>
                      <div className="text-danger/90">{iss.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input ref={fileRef} type="file" accept=".txt,.csv,.tsv,text/plain" className="hidden" onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            import file
          </button>
          <button
            type="button"
            onClick={() => setText('')}
            className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface-alt hover:text-danger"
          >
            clear
          </button>
          <span className="ml-auto hidden text-xs text-muted sm:inline">ctrl + enter to save</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            cancel
          </button>
          <button
            type="button"
            disabled={dictStatus === 'loading'}
            onClick={handleSave}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {dictStatus === 'loading' ? 'loading…' : 'save & start'}
          </button>
        </div>
      </div>
    </div>
  );
}
