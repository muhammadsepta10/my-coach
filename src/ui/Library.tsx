import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { type KneeAccess, kneeLockReason } from '../coach/knee';
import { formatKg } from '../coach/plates';
import { CORE_POOL, DAY_LABEL, DEFAULT_IDS, EXERCISE_BY_ID, SLOTS } from '../coach/program';
import type { ExerciseDef, ExerciseState } from '../coach/types';
import type { Settings } from '../data/db';
import { coach } from '../data/instance';
import { ExerciseAnimation } from './ExerciseAnimation';
import { KneeTierPill } from './SwapSheet';
import { HowTo } from './Workout';
import { Card, Pill, loadText } from './common';

const ROLE_LABEL = { primary: 'utama · tetap 4 minggu', accessory: 'berganti tiap sesi', optional: 'opsional' } as const;

export function Library({ settings }: { settings: Settings }) {
  const states = useLiveQuery(() => coach.getStates(), []);
  const knee = useLiveQuery(() => coach.kneeAccessNow(), []);
  const [open, setOpen] = useState<string | null>(null);
  const days = ['A', 'B', 'C'] as const;
  const row = (e: ExerciseDef) => (
    <ExerciseRow
      key={e.id}
      def={e}
      state={states?.[e.id]}
      settings={settings}
      knee={knee}
      open={open === e.id}
      onToggle={() => setOpen(open === e.id ? null : e.id)}
    />
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gerakan</h1>
      <p className="text-sm text-slate-400">
        Tiap hari terdiri dari slot; coach memilih satu gerakan per slot. Tandai ❤️ supaya lebih sering dipilih, 🚫 supaya tidak pernah
        dipilih. ⭐ = gerakan asli program.
      </p>
      {days.map((d) => (
        <section key={d} className="space-y-3">
          <h2 className="font-semibold text-slate-300">{DAY_LABEL[d]}</h2>
          {SLOTS.filter((s) => s.day === d).map((slot) => (
            <div key={slot.id} className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {slot.label} <span className="normal-case tracking-normal">· {ROLE_LABEL[slot.role]}</span>
              </p>
              {slot.candidates.map((id) => row(EXERCISE_BY_ID[id]))}
            </div>
          ))}
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-300">Core — kolam bersama</h2>
        <p className="text-xs text-slate-500">Tiap sesi: 1 anti-gerakan + 1 lainnya, tidak mengulang sesi terakhir. Carry hanya kalau dumbel sedang terpasang.</p>
        {CORE_POOL.map(row)}
      </section>
    </div>
  );
}

function ExerciseRow({
  def: e,
  state,
  settings,
  knee,
  open,
  onToggle,
}: {
  def: ExerciseDef;
  state?: ExerciseState;
  settings: Settings;
  knee?: KneeAccess;
  open: boolean;
  onToggle: () => void;
}) {
  const fav = settings.favorites.includes(e.id);
  const banned = settings.banned.includes(e.id);
  const lock = knee ? kneeLockReason(e.kneeTier, knee) : undefined;
  return (
    <Card className={`p-3 ${banned ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <button className="flex-1 min-w-0 flex items-center gap-3 text-left" onClick={onToggle}>
          <div className="text-slate-200 shrink-0">
            <ExerciseAnimation exerciseId={e.id} size="sm" playing={open} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {DEFAULT_IDS.has(e.id) && <span aria-label="gerakan asli">⭐ </span>}
              {e.name}
            </p>
            <p className="text-xs text-slate-400">{e.muscles}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {e.block === 'core' && <Pill>{e.coreType === 'anti' ? 'core · anti-gerakan' : 'core'}</Pill>}
              {e.carry && <Pill>butuh dumbel</Pill>}
              <KneeTierPill tier={e.kneeTier !== 'low' ? e.kneeTier : undefined} />
              {lock && <Pill tone="rose">🔒 terkunci</Pill>}
              {banned && <Pill tone="rose">tidak dipilih</Pill>}
            </div>
          </div>
        </button>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            aria-label={fav ? 'Hapus dari favorit' : 'Tandai favorit'}
            aria-pressed={fav}
            className={`w-10 h-10 rounded-lg text-lg ${fav ? 'bg-rose-500/20' : 'bg-slate-800 grayscale opacity-60'}`}
            onClick={() => coach.toggleFavorite(e.id)}
          >
            ❤️
          </button>
          <button
            aria-label={banned ? 'Boleh dipilih lagi' : 'Jangan pernah pilih'}
            aria-pressed={banned}
            className={`w-10 h-10 rounded-lg text-lg ${banned ? 'bg-rose-500/20' : 'bg-slate-800 grayscale opacity-60'}`}
            onClick={() => coach.toggleBanned(e.id)}
          >
            🚫
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="text-slate-200 flex justify-center">
            <ExerciseAnimation exerciseId={e.id} />
          </div>
          {lock && <p className="text-sm text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">🔒 {lock}</p>}
          <StateLine state={state} def={e} />
          <HowTo exerciseId={e.id} />
        </div>
      )}
    </Card>
  );
}

function StateLine({ state, def }: { state?: ExerciseState; def: ExerciseDef }) {
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
