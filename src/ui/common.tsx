import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { PlannedSet } from '../coach/planner';
import { formatLoad, type LoadMode } from '../coach/plates';
import type { ExerciseDef } from '../coach/types';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-slate-900 border border-slate-800 p-4 ${className}`}>{children}</section>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-sky-500 text-slate-950 font-semibold active:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-400',
    secondary: 'bg-slate-800 text-slate-100 active:bg-slate-700 border border-slate-700',
    ghost: 'text-sky-400 active:text-sky-300',
    danger: 'bg-rose-600/20 text-rose-300 border border-rose-700 active:bg-rose-600/30',
  };
  return <button className={`rounded-xl px-4 py-3 text-base transition-colors ${styles[variant]} ${className}`} {...rest} />;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label="Kurangi"
        className="w-10 h-10 rounded-lg bg-slate-800 text-xl active:bg-slate-700"
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
      >
        −
      </button>
      <span className="min-w-12 text-center text-lg font-semibold tabular-nums">
        {value}
        {suffix && <span className="text-xs text-slate-400 ml-0.5">{suffix}</span>}
      </span>
      <button
        aria-label="Tambah"
        className="w-10 h-10 rounded-lg bg-slate-800 text-xl active:bg-slate-700"
        onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
      >
        +
      </button>
    </div>
  );
}

export function PainScale({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`h-11 rounded-lg text-sm font-semibold ${
              value === i ? (i >= 4 ? 'bg-rose-500 text-white' : i >= 3 ? 'bg-amber-400 text-slate-900' : 'bg-emerald-500 text-slate-900') : 'bg-slate-800'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>0 = tidak nyeri</span>
        <span>10 = sangat nyeri</span>
      </div>
    </div>
  );
}

export function targetText(def: ExerciseDef, set: PlannedSet): string {
  const per = def.perSide ? '/sisi' : '';
  if (def.kind === 'timed') return `${set.repMax} dtk${per}`;
  if (set.kind === 'calibration') return `sampai sisa ±2 rep${per}`;
  if (set.kind === 'amrap') return `maks rep (min ${set.repMin})${per}`;
  if (set.kind === 'warmup') return `${set.repMin} rep`;
  return `${set.repMin}–${set.repMax} rep${per}`;
}

export function loadText(mode: LoadMode | undefined, load: number | undefined): string {
  if (!mode) return 'berat badan';
  if (load === undefined) return 'dihitung setelah kalibrasi';
  return formatLoad(mode, load);
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'sky' | 'amber' | 'rose' | 'emerald' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300',
    sky: 'bg-sky-500/15 text-sky-300',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}
