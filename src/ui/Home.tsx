import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addDays, daysBetween, today } from '../coach/dates';
import { DAY_LABEL, MOBILITY_STEPS, SLOT_BY_ID } from '../coach/program';
import { SEQUENCES } from '../coach/rotation';
import type { PlannedExercise } from '../coach/planner';
import type { Settings } from '../data/db';
import { coach } from '../data/instance';
import { ExerciseAnimation } from './ExerciseAnimation';
import { SwapSheet } from './SwapSheet';
import { Button, Card, PainScale, Pill, formatDate, loadText, targetText } from './common';

export function Home({ settings }: { settings: Settings }) {
  const plan = useLiveQuery(() => coach.previewPlan(), []);
  const pendingKnee = useLiveQuery(() => coach.pendingKneeCheck(), []);
  const phase2 = useLiveQuery(() => coach.phase2Offer(), []);
  const weights = useLiveQuery(() => coach.bodyWeights(), []);
  const protein = useLiveQuery(() => coach.proteinTarget(), []);
  const history = useLiveQuery(() => coach.history(), []);
  const block = useLiveQuery(() => coach.blockStatus(), []);
  const [askKnee, setAskKnee] = useState(false);
  const [swap, setSwap] = useState<number | null>(null);

  const t = today();
  const week = Math.floor(daysBetween(settings.programStart, t) / 7) + 1;
  const last7 = history?.filter((s) => daysBetween(s.date, t) < 7) ?? [];
  const lastWeight = weights?.[weights.length - 1];
  const needWeigh = !lastWeight || daysBetween(lastWeight.date, t) >= 7;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-slate-400 text-sm">
            Minggu ke-{week} · Fase {settings.phase}
          </p>
          <h1 className="text-2xl font-bold">Latihan Hari Ini</h1>
        </div>
        <div className="text-right text-sm text-slate-400">
          <div className="text-2xl font-bold text-slate-100 tabular-nums">{last7.length}</div>
          sesi / 7 hari
        </div>
      </header>

      {pendingKnee && <KneeNextDayCard sessionId={pendingKnee.id!} />}
      {phase2 && <Phase2Card />}
      {block?.showCard && <BlockCard block={block} />}

      {plan?.deload && (
        <Card className="border-amber-700/60 bg-amber-950/30">
          <p className="font-semibold text-amber-300">Minggu ringan (deload)</p>
          <p className="text-sm text-amber-200/80">{plan.deloadReason ?? 'Saatnya memulihkan badan.'} Set dikurangi, beban 90%.</p>
        </Card>
      )}

      {plan && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{DAY_LABEL[plan.dayType]}</h2>
            <RotationDots phase={settings.phase} current={plan.dayType} />
          </div>
          {plan.notes.map((n) => (
            <p key={n} className="text-sm text-sky-200/90 bg-sky-500/10 rounded-lg px-3 py-2">
              {n}
            </p>
          ))}
          {plan.dayType === 'AKTIF' ? (
            <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
              {MOBILITY_STEPS.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-slate-800">
              {plan.exercises.map((e, i) => (
                <PlanRow key={e.def.id} e={e} onSwap={() => setSwap(i)} />
              ))}
            </ul>
          )}
          <Button
            className="w-full"
            onClick={async () => {
              if (plan.dayType === 'C') setAskKnee(true);
              else await coach.startSession({});
            }}
          >
            {plan.dayType === 'AKTIF' ? 'Mulai Hari Aktif' : 'Mulai Latihan'}
          </Button>
        </Card>
      )}

      {askKnee && <KneePreDialog onCancel={() => setAskKnee(false)} />}
      {swap !== null && plan?.exercises[swap] && (
        <SwapSheet
          title={`${slotLabel(plan.exercises[swap])} · sekarang: ${plan.exercises[swap].displayName}`}
          load={() => coach.previewSwapOptions(swap)}
          onPick={(id) => coach.previewSwap(plan.exercises[swap].slotId, id)}
          onClose={() => setSwap(null)}
        />
      )}

      {needWeigh && <WeighCard last={lastWeight?.kg} />}

      {protein !== undefined && (
        <Card>
          <p className="text-sm text-slate-400">Saran harian</p>
          <p>
            Protein ±<span className="font-semibold">{protein} g</span>/hari, minum air cukup, tidur 7–8 jam.
          </p>
          <p className="text-xs text-slate-500 mt-1">Hanya saran umum — konsultasikan ke ahli gizi untuk rencana makan.</p>
        </Card>
      )}
    </div>
  );
}

function slotLabel(e: PlannedExercise): string {
  return SLOT_BY_ID[e.slotId]?.label ?? (e.slotId === 'core:anti' ? 'Core (anti-gerakan)' : 'Core');
}

function PlanRow({ e, onSwap }: { e: PlannedExercise; onSwap: () => void }) {
  const work = e.sets.filter((s) => s.kind !== 'warmup');
  const first = work[0];
  return (
    <li className="py-2 flex items-center gap-3">
      <div className="shrink-0 text-slate-200">
        <ExerciseAnimation exerciseId={e.def.id} size="sm" playing={false} />
      </div>
      <div className="min-w-0">
        <p className="font-medium truncate">
          {e.displayName}
          {e.def.block === 'core' && <span className="ml-2"><Pill>core</Pill></span>}
        </p>
        <p className="text-sm text-slate-400">
          {first?.kind === 'calibration' ? (
            <>
              1 set kalibrasi ({loadText(e.def.loadMode, first.load)}) + {work.length - 1} set {targetText(e.def, work[1] ?? first)}
            </>
          ) : (
            <>
              {work.length} × {first ? targetText(e.def, first) : ''}
              {e.def.kind === 'weighted' && <> · {loadText(e.def.loadMode, first?.load)}</>}
            </>
          )}
        </p>
      </div>
      <button className="ml-auto shrink-0 text-xs text-sky-400 px-2 py-2" aria-label={`Ganti gerakan ${e.displayName}`} onClick={onSwap}>
        ⇄ Ganti
      </button>
    </li>
  );
}

function BlockCard({ block }: { block: Awaited<ReturnType<typeof coach.blockStatus>> }) {
  return (
    <Card className="space-y-3 border-violet-800 bg-violet-950/30">
      <div>
        <p className="font-semibold text-violet-300">Blok baru #{block.index} 🔄</p>
        <p className="text-sm text-violet-100/80">
          {formatDate(block.start)} – {formatDate(block.end)}. Gerakan utama berikut tetap sama selama 4 minggu supaya progres beban terukur.
          Gerakan pelengkap & core tetap berganti tiap sesi.
        </p>
      </div>
      {(['A', 'B', 'C'] as const).map((d) => (
        <div key={d}>
          <p className="text-xs text-slate-400">{DAY_LABEL[d]}</p>
          <ul className="text-sm list-disc pl-5">
            {block.primaries
              .filter((p) => p.day === d)
              .map((p) => (
                <li key={p.slotId}>
                  <span className="text-slate-400">{p.slot}:</span> {p.name}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <Button variant="secondary" className="w-full" onClick={() => coach.dismissBlockCard(block.index)}>
        Oke, mengerti
      </Button>
    </Card>
  );
}

function RotationDots({ phase, current }: { phase: 1 | 2; current: string }) {
  const seq = SEQUENCES[phase];
  return (
    <div className="flex gap-1 text-[10px]">
      {seq.map((d, i) => (
        <span key={i} className={`px-1.5 py-0.5 rounded ${d === current ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>
          {d === 'AKTIF' ? 'Akt' : d}
        </span>
      ))}
    </div>
  );
}

function KneePreDialog({ onCancel }: { onCancel: () => void }) {
  const [v, setV] = useState<number | undefined>();
  return (
    <div className="fixed inset-0 z-20 bg-black/70 grid items-end">
      <div className="bg-slate-900 rounded-t-3xl p-5 space-y-4 max-w-lg w-full mx-auto safe-bottom">
        <h3 className="text-lg font-semibold">Cek lutut kiri sebelum latihan</h3>
        <p className="text-sm text-slate-400">Seberapa nyeri lututmu sekarang (saat jalan / jongkok ringan)?</p>
        <PainScale value={v} onChange={setV} />
        {v !== undefined && v >= 4 && (
          <p className="text-sm text-rose-300">Beban gerakan kaki akan dikurangi 20% dan squat dibuat lebih dangkal. Kalau nyeri tajam, lewati latihan kaki hari ini.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Batal
          </Button>
          <Button disabled={v === undefined} onClick={() => coach.startSession({ kneePre: v })}>
            Lanjut
          </Button>
        </div>
      </div>
    </div>
  );
}

function KneeNextDayCard({ sessionId }: { sessionId: number }) {
  const [v, setV] = useState<number | undefined>();
  return (
    <Card className="space-y-3 border-sky-800">
      <p className="font-semibold">Bagaimana lutut kirimu hari ini?</p>
      <p className="text-sm text-slate-400">Sehari setelah latihan kaki. Ini membantu coach mengatur beban sesi C berikutnya.</p>
      <PainScale value={v} onChange={setV} />
      <Button className="w-full" disabled={v === undefined} onClick={() => coach.recordKneeNextDay(sessionId, v!)}>
        Simpan
      </Button>
    </Card>
  );
}

function Phase2Card() {
  return (
    <Card className="space-y-3 border-emerald-800 bg-emerald-950/30">
      <p className="font-semibold text-emerald-300">Siap naik ke Fase 2? 💪</p>
      <p className="text-sm text-emerald-100/80">
        Sudah 6 minggu dan lutut stabil. Fase 2: A → B → C → A → B → C → Aktif (tiap otot ±2×/minggu).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => coach.snoozePhase2(addDays(today(), 14))}>
          Nanti saja
        </Button>
        <Button onClick={() => coach.acceptPhase2()}>Naik Fase 2</Button>
      </div>
    </Card>
  );
}

function WeighCard({ last }: { last?: number }) {
  const [kg, setKg] = useState<string>(last ? String(last) : '');
  return (
    <Card className="space-y-2">
      <p className="font-semibold">Timbang berat badan mingguan</p>
      <p className="text-sm text-slate-400">Pagi hari, setelah ke toilet, sebelum makan.</p>
      <div className="flex gap-2">
        <input type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} className="input mt-0" placeholder="kg" />
        <Button disabled={!Number(kg)} onClick={() => coach.addBodyWeight(Number(kg))}>
          Simpan
        </Button>
      </div>
    </Card>
  );
}
