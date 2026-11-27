import type { ReactNode } from 'react';

/** Small uppercase mono label used across the deck ("PACK", "キー/分"…). */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10px] uppercase tracking-[0.18em] text-muted ${className}`}>{children}</div>
  );
}

export function Kbd({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-5 items-center justify-center rounded border px-1 py-px font-mono text-[10px] leading-4 transition-colors ${
        active ? 'border-accent bg-accent text-surface' : 'border-line bg-surface-alt text-ink/80'
      }`}
    >
      {children}
    </kbd>
  );
}

/** Buttons never take keyboard focus, so typing always goes to the test. */
const noFocus = {
  tabIndex: -1,
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
};

export function Pill({
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
      {...noFocus}
      title={title}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
        active
          ? 'border-accent/70 bg-accent/10 text-accent'
          : 'border-line text-muted hover:border-muted/60 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** Pill with an LED-style indicator dot for on/off study settings. */
export function TogglePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      {...noFocus}
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
        on ? 'border-line text-ink' : 'border-line/60 text-muted hover:text-ink'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors ${on ? 'bg-matcha shadow-[0_0_6px] shadow-matcha/60' : 'bg-line'}`}
      />
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: readonly (readonly [T, ReactNode])[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-card p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          {...noFocus}
          onClick={() => key !== value && onChange(key)}
          className={`rounded-lg transition-colors duration-150 ${
            size === 'sm' ? 'px-2.5 py-0.5 font-mono text-[11px]' : 'px-4 py-1.5 text-sm sm:px-5'
          } ${key === value ? 'bg-ink text-surface' : 'text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...noFocus}
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-muted/60 hover:text-ink"
    >
      {children}
    </button>
  );
}

export function RestartIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}
