import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { formatKg } from '../coach/plates';
import { DAY_LABEL, EXERCISES } from '../coach/program';
import type { ExerciseState } from '../coach/types';
import type { Settings } from '../data/db';
import { coach } from '../data/instance';
import { ExerciseAnimation } from './ExerciseAnimation';
import { HowTo } from './Workout';
import { Card, Pill, loadText } from './common';

export function Library(_: { settings: Settings }) {
  const states = useLiveQuery(() => coach.getStates(), []);
  const [open, setOpen] = useState<string | null>(null);
  const days = ['A', 'B', 'C'] as const;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gerakan</h1>
      <p className="text-sm text-slate-400">Ketuk gerakan untuk melihat animasi, cara melakukan, dan status progresmu.</p>
      {days.map((d) => (
        <section key={d} className="space-y-2">
          <h2 className="font-semibold text-slate-300">{DAY_LABEL[d]}</h2>
          {EXERCISES.filter((e) => e.day === d).map((e) => (
            <Card key={e.id} className="p-3">
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <div className="text-slate-200 shrink-0">
                  <ExerciseAnimation exerciseId={e.id} size="sm" playing={open === e.id} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-slate-400">{e.muscles}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {e.block === 'core' && <Pill>core</Pill>}
                    {e.kneeGated && <Pill tone="rose">terkunci s/d lutut stabil</Pill>}
                    {e.optional && <Pill>opsional</Pill>}
                  </div>
                </div>
              </button>
              {open === e.id && (
                <div className="mt-3 space-y-3">
                  <div className="text-slate-200 flex justify-center">
                    <ExerciseAnimation exerciseId={e.id} />
                  </div>
                  <StateLine state={states?.[e.id]} id={e.id} />
                  <HowTo exerciseId={e.id} />
                </div>
              )}
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}

function StateLine({ state, id }: { state?: ExerciseState; id: string }) {
  const def = EXERCISES.find((e) => e.id === id)!;
  if (!state) return <p className="text-sm text-slate-500">Belum pernah dilakukan.</p>;
  return (
    <div className="text-sm grid grid-cols-2 gap-2">
      {def.kind === 'weighted' && (
        <>
          <Info label="Beban kerja" value={loadText(def.loadMode, state.load)} />
          <Info label="Estimasi 1RM" value={state.e1rm ? formatKg(Math.round(state.e1rm * 10) / 10) : '—'} />
        </>
      )}
      {def.variants && <Info label="Variasi" value={def.variants[state.variant]} />}
      <Info label="Target" value={def.kind === 'timed' ? `${state.repMax} dtk` : `${state.repMin}–${state.repMax} rep`} />
      <Info label="Sesi" value={String(state.sessions)} />
      {state.tempo && <Info label="Mode" value="Tempo lambat" />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/70 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
