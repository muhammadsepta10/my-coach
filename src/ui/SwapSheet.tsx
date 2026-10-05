import { useEffect, useState } from 'react';
import type { PlannedExercise } from '../coach/planner';
import type { KneeTier } from '../coach/types';
import { ExerciseAnimation } from './ExerciseAnimation';
import { Button, Pill, loadText, targetText } from './common';

const TIER_LABEL: Record<KneeTier, { text: string; tone: 'emerald' | 'amber' | 'rose' }> = {
  low: { text: 'lutut: ringan', tone: 'emerald' },
  medium: { text: 'lutut: sedang', tone: 'amber' },
  high: { text: 'lutut: berat', tone: 'rose' },
};

export function KneeTierPill({ tier }: { tier?: KneeTier }) {
  if (!tier) return null;
  const t = TIER_LABEL[tier];
  return <Pill tone={t.tone}>{t.text}</Pill>;
}

/** Lembar "Ganti gerakan": alternatif dari slot yang sama, boleh untuk lutut, bukan 🚫. */
export function SwapSheet({
  title,
  load,
  onPick,
  onClose,
}: {
  title: string;
  load: () => Promise<PlannedExercise[]>;
  onPick: (exerciseId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<PlannedExercise[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // dimuat sekali saat lembar dibuka
  useEffect(() => {
    load().then(setOptions, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="fixed inset-0 z-30 bg-black/70 grid items-end" onClick={onClose}>
      <div className="bg-slate-900 rounded-t-3xl p-5 space-y-3 max-w-lg w-full mx-auto safe-bottom max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-semibold">Ganti gerakan</h3>
          <p className="text-sm text-slate-400">{title}</p>
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {options === null && !error && <p className="text-sm text-slate-500">Memuat…</p>}
        {options?.length === 0 && (
          <p className="text-sm text-slate-400">Belum ada alternatif lain untuk slot ini (terkunci lutut atau ditandai 🚫).</p>
        )}
        <ul className="space-y-2">
          {options?.map((o) => {
            const work = o.sets.filter((s) => s.kind !== 'warmup');
            const first = work[0];
            return (
              <li key={o.def.id}>
                <button
                  disabled={busy}
                  className="w-full flex items-center gap-3 rounded-xl bg-slate-800 border border-slate-700 p-2 text-left active:bg-slate-700"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onPick(o.def.id);
                      onClose();
                    } catch (e) {
                      setError((e as Error).message);
                      setBusy(false);
                    }
                  }}
                >
                  <div className="shrink-0 text-slate-200">
                    <ExerciseAnimation exerciseId={o.def.id} size="sm" playing={false} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{o.displayName}</p>
                    <p className="text-xs text-slate-400">{o.def.muscles}</p>
                    <p className="text-sm text-slate-300">
                      {first?.kind === 'calibration'
                        ? `Set kalibrasi (${loadText(o.def.loadMode, first.load)})`
                        : `${work.length} × ${first ? targetText(o.def, first) : ''}${o.def.kind === 'weighted' ? ` · ${loadText(o.def.loadMode, first?.load)}` : ''}`}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <KneeTierPill tier={o.def.kneeTier} />
                      {o.seed && <Pill tone="sky">beban diperkirakan</Pill>}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
