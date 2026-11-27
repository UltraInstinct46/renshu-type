import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { parseCustomWords } from '../utils/customWords';
import { defaultRomaji } from '../utils/romajiEngine';

const PLACEHOLDER = `猫|ねこ|cat
図書館|としょかん|library
食べる たべる to eat
ありがとう
コーヒー`;

const PREVIEW_LIMIT = 60;

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
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseCustomWords(text), [text]);
  const { words, issues } = parsed;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave(text);
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
              one per line · <span className="font-jp text-ink">言葉|ことば|meaning</span> · kana-only words need no
              reading · separators: <span className="text-ink">| tab , space</span> · <span className="text-ink">#</span>{' '}
              for comments
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

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_300px]">
          <textarea
            autoFocus
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            className="h-80 w-full resize-none rounded-lg bg-surface-alt p-4 font-jp text-sm leading-relaxed text-ink outline-none ring-accent/40 placeholder:text-muted/50 focus:ring-1"
          />

          <div className="flex h-80 min-h-0 flex-col rounded-lg bg-surface-alt/60 p-3 text-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-muted">preview</span>
              <span className={words.length ? 'text-accent' : 'text-muted'}>
                {words.length} word{words.length === 1 ? '' : 's'} ready
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {words.length === 0 && issues.length === 0 && (
                <p className="mt-6 text-center text-xs text-muted/70">type or paste words on the left</p>
              )}
              {words.slice(0, PREVIEW_LIMIT).map((w) => (
                <div key={w.id} className="flex items-baseline gap-2 border-b border-white/5 py-1">
                  <span className="font-jp text-ink">{w.text}</span>
                  {w.text !== w.reading && <span className="font-jp text-xs text-muted">{w.reading}</span>}
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
            onClick={() => onSave(text)}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-surface transition-opacity hover:opacity-90"
          >
            save &amp; start
          </button>
        </div>
      </div>
    </div>
  );
}
