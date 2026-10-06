import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { family, setupInstruction } from '../coach/planner';
import { achievableLoads, formatKg } from '../coach/plates';
import { DAY_LABEL, EXERCISE_BY_ID, MOBILITY_STEPS, SLOT_BY_ID, WARMUP_STEPS, youtubeUrl } from '../coach/program';
import { injuryName } from '../coach/injury';
import { slotIdOf } from '../coach/selection';
import type { Feel } from '../coach/types';
import type { SessionExercise, SessionRecord, Settings } from '../data/db';
import { coach } from '../data/instance';
import { ExerciseAnimation } from './ExerciseAnimation';
import { PainChecks, capitalize } from './Injuries';
import { SwapSheet } from './SwapSheet';
import { Button, Card, Pill, Stepper, loadText, targetText } from './common';
import { beep, useWakeLock } from './feedback';

export function Workout({ session, settings }: { session: SessionRecord; settings: Settings }) {
  useWakeLock();
  if (session.dayType === 'AKTIF') return <ActiveDay session={session} />;
  if (!session.warmupDone) return <Warmup session={session} />;
  if (session.cursor >= session.exercises.length) return <Finish session={session} />;
  // key: reset input set setiap pindah atau ganti gerakan
  return <ExerciseStep key={`${session.cursor}-${session.exercises[session.cursor].exerciseId}`} session={session} settings={settings} />;
}

function Shell({ session, children, title }: { session: SessionRecord; children: React.ReactNode; title?: string }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="min-h-dvh max-w-lg mx-auto px-4 pt-3 pb-40">
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400">{DAY_LABEL[session.dayType]}</p>
          {title && <p className="font-semibold">{title}</p>}
        </div>
        <button className="text-slate-400 px-2 py-1 text-2xl leading-none" aria-label="Menu sesi" onClick={() => setMenu(true)}>
          ⋯
        </button>
      </header>
      {children}
      {menu && (
        <div className="fixed inset-0 z-30 bg-black/70 grid items-end" onClick={() => setMenu(false)}>
          <div className="bg-slate-900 rounded-t-3xl p-5 space-y-2 max-w-lg w-full mx-auto safe-bottom" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await coach.updateSession(session.id!, { warmupDone: true, cursor: session.exercises.length });
                setMenu(false);
              }}
            >
              Akhiri sesi sekarang (simpan yang sudah dicatat)
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (confirm('Batalkan sesi ini? Catatan sesi ini akan dihapus.')) await coach.discardSession(session.id!);
              }}
            >
              Batalkan sesi
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setMenu(false)}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Warmup({ session }: { session: SessionRecord }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const total = WARMUP_STEPS.reduce((s, w) => s + w.seconds, 0);
  return (
    <Shell session={session} title="Pemanasan ±5 menit">
      <div className="space-y-3">
        <AkutOffers session={session} />
        {session.notes.map((n) => (
          <p key={n} className="text-sm text-sky-200/90 bg-sky-500/10 rounded-lg px-3 py-2">
            {n}
          </p>
        ))}
        <Card>
          <ul className="space-y-1">
            {WARMUP_STEPS.map((w, i) => (
              <li key={w.name}>
                <label className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-sky-500"
                    checked={checked.has(i)}
                    onChange={() => {
                      const n = new Set(checked);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      setChecked(n);
                    }}
                  />
                  <span className="flex-1">{w.name}</span>
                  <span className="text-sm text-slate-400 tabular-nums">{w.seconds} dtk</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-2">Total ±{Math.round(total / 60)} menit. Gerak pelan, tanpa nyeri.</p>
        </Card>
        <Countdown seconds={total} label="Timer pemanasan" />
      </div>
      <BottomBar>
        <Button className="w-full" onClick={() => coach.updateSession(session.id!, { warmupDone: true })}>
          {checked.size === WARMUP_STEPS.length ? 'Selesai pemanasan →' : 'Lanjut ke latihan →'}
        </Button>
      </BottomBar>
    </Shell>
  );
}

/** Nyeri ≥4 sebelum sesi: tawarkan mengubah status cedera jadi Akut (bukan hanya hari ini). */
function AkutOffers({ session }: { session: SessionRecord }) {
  const injuries = useLiveQuery(() => coach.activeInjuries(), []);
  const offers = (injuries ?? []).filter((i) => session.akutOffers?.includes(i.id) && i.status !== 'akut');
  const dismiss = (id: string) => coach.updateSession(session.id!, { akutOffers: session.akutOffers?.filter((x) => x !== id) });
  return (
    <>
      {offers.map((i) => (
        <Card key={i.id} className="space-y-2 border-rose-800 bg-rose-950/30">
          <p className="font-semibold text-rose-300">
            {capitalize(injuryName(i))} nyeri {session.pain?.[i.id]?.pre}/10
          </p>
          <p className="text-sm text-rose-100/80">Hari ini gerakan yang membebaninya sudah dilewati. Ubah status jadi Akut supaya sesi berikutnya juga begitu?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => dismiss(i.id)}>
              Hari ini saja
            </Button>
            <Button
              onClick={async () => {
                await coach.setInjuryStatus(i.id, 'akut');
                await dismiss(i.id);
              }}
            >
              Ubah jadi Akut
            </Button>
          </div>
        </Card>
      ))}
    </>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 pt-3 safe-bottom z-10">
      <div className="max-w-lg mx-auto space-y-2">{children}</div>
    </div>
  );
}

function prevFamily(session: SessionRecord, idx: number): 'barbell' | 'dumbbell' | 'none' {
  for (let i = idx - 1; i >= 0; i--) {
    const e = session.exercises[i];
    if (e.skipped) continue;
    const def = EXERCISE_BY_ID[e.exerciseId];
    if (def?.loadMode) return family(def);
  }
  return 'none';
}

interface Rest {
  endAt: number;
  total: number;
}

function ExerciseStep({ session, settings }: { session: SessionRecord; settings: Settings }) {
  const idx = session.cursor;
  const ex = session.exercises[idx];
  const def = EXERCISE_BY_ID[ex.exerciseId];
  const [rest, setRest] = useState<Rest | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const canSwap = !coach.swapLocked(ex);
  const allDone = ex.logged.every((l) => l.done);
  const nextIdx = ex.logged.findIndex((l) => !l.done);
  const currentLoad = ex.planned[nextIdx === -1 ? ex.planned.length - 1 : nextIdx]?.load ?? ex.planned.find((p) => p.kind === 'work')?.load;

  const setup =
    def.loadMode && currentLoad !== undefined ? setupInstruction(settings.equipment, prevFamily(session, idx), def.loadMode, currentLoad) : undefined;

  const go = (cursor: number) => {
    setRest(null);
    void coach.updateSession(session.id!, { cursor });
    window.scrollTo({ top: 0 });
  };

  const onLogged = (setIdx: number) => {
    const kind = ex.planned[setIdx].kind;
    const isLast = setIdx === ex.planned.length - 1;
    const secs = kind === 'warmup' ? 45 : ex.restSec;
    if (!isLast || idx < session.exercises.length - 1) setRest({ endAt: Date.now() + secs * 1000, total: secs });
  };

  return (
    <Shell session={session} title={`Gerakan ${idx + 1} dari ${session.exercises.length}`}>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden mb-3">
        <div className="h-full bg-sky-500" style={{ width: `${(idx / session.exercises.length) * 100}%` }} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col items-center text-slate-200">
          <ExerciseAnimation exerciseId={def.id} />
        </div>
        <div>
          <h1 className="text-xl font-bold">{ex.displayName}</h1>
          <p className="text-sm text-slate-400">{def.muscles}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {def.block === 'core' && <Pill>core</Pill>}
            {ex.tempo && <Pill tone="amber">tempo 3-1-1</Pill>}
            {ex.kneeReduced && <Pill tone="rose">beban dikurangi (lutut)</Pill>}
            {session.deload && <Pill tone="amber">deload</Pill>}
            <Pill>istirahat {ex.restSec} dtk</Pill>
          </div>
          {canSwap ? (
            <button className="mt-2 text-sm text-sky-400" onClick={() => setSwapping(true)}>
              ⇄ Ganti gerakan
            </button>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Mau ganti gerakan? Urungkan dulu set yang sudah dicatat (tombol "ubah").</p>
          )}
        </div>
        {swapping && (
          <SwapSheet
            title={`${SLOT_BY_ID[ex.slotId ?? slotIdOf(def)]?.label ?? 'Core'} · sekarang: ${ex.displayName}`}
            load={() => coach.swapOptions(session.id!, idx)}
            onPick={(id) => coach.swapExercise(session.id!, idx, id)}
            onClose={() => setSwapping(false)}
          />
        )}

        {ex.notes.map((n) => (
          <p key={n} className="text-sm text-sky-200/90 bg-sky-500/10 rounded-lg px-3 py-2">
            {n}
          </p>
        ))}

        {setup && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-700/50 px-3 py-2 text-sm text-amber-100">
            <span className="font-semibold">🔧 Siapkan alat: </span>
            {setup}
          </div>
        )}

        <button className="text-sm text-sky-400" onClick={() => setShowHow(!showHow)}>
          {showHow ? '▾' : '▸'} Cara melakukan & kesalahan umum
        </button>
        {showHow && <HowTo exerciseId={def.id} />}

        <Card className="p-2">
          <ul className="divide-y divide-slate-800">
            {ex.planned.map((_, i) => (
              <SetRow
                key={i}
                session={session}
                settings={settings}
                ex={ex}
                exIdx={idx}
                setIdx={i}
                setNumber={ex.planned.slice(0, i + 1).filter((x) => x.kind !== 'warmup').length}
                isNext={i === nextIdx}
                onLogged={() => onLogged(i)}
              />
            ))}
          </ul>
        </Card>

        {allDone && <FeelPicker value={ex.feel} onPick={async (f) => { await coach.setFeel(session.id!, idx, f); go(idx + 1); }} />}
      </div>

      <BottomBar>
        {rest && <RestBar rest={rest} sound={settings.sound} onDone={() => setRest(null)} onAdd={(s) => setRest({ endAt: rest.endAt + s * 1000, total: rest.total + s })} />}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)}>
            ‹ Kembali
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await coach.skipExercise(session.id!, idx, true);
              go(idx + 1);
            }}
          >
            Lewati
          </Button>
          <Button variant={allDone ? 'primary' : 'secondary'} onClick={() => go(idx + 1)}>
            Lanjut ›
          </Button>
        </div>
      </BottomBar>
    </Shell>
  );
}

export function HowTo({ exerciseId }: { exerciseId: string }) {
  const def = EXERCISE_BY_ID[exerciseId];
  return (
    <Card className="text-sm space-y-2">
      <ol className="list-decimal pl-5 space-y-1 text-slate-200">
        {def.cues.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div>
        <p className="text-rose-300 font-medium">Hindari:</p>
        <ul className="list-disc pl-5 text-slate-300">
          {def.mistakes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
      <a href={youtubeUrl(def)} target="_blank" rel="noreferrer" className="inline-block text-sky-400 underline">
        ▶ Lihat contoh video di YouTube
      </a>
    </Card>
  );
}

const SET_LABEL = { warmup: 'Pemanasan', calibration: 'Kalibrasi', work: 'Set', amrap: 'AMRAP' } as const;

function SetRow({
  session,
  settings,
  ex,
  exIdx,
  setIdx,
  setNumber,
  isNext,
  onLogged,
}: {
  session: SessionRecord;
  settings: Settings;
  ex: SessionExercise;
  exIdx: number;
  setIdx: number;
  setNumber: number;
  isNext: boolean;
  onLogged: () => void;
}) {
  const def = EXERCISE_BY_ID[ex.exerciseId];
  const planned = ex.planned[setIdx];
  const logged = ex.logged[setIdx];
  const defaultReps = planned.kind === 'calibration' ? 12 : planned.kind === 'amrap' ? planned.repMin : planned.repMax;
  const [reps, setReps] = useState<number>(logged.done ? logged.reps : defaultReps);
  const [load, setLoad] = useState<number | undefined>(logged.load ?? planned.load);
  const [timer, setTimer] = useState(false);
  const loads = useMemo(() => (def.loadMode ? achievableLoads(settings.equipment, def.loadMode).map((l) => l.total) : []), [def.loadMode, settings.equipment]);

  useEffect(() => {
    if (!logged.done && planned.load !== undefined) setLoad(planned.load);
  }, [planned.load, logged.done]);

  const label = planned.kind === 'work' ? `${SET_LABEL.work} ${setNumber}` : planned.kind === 'amrap' ? `Set ${setNumber} · AMRAP` : SET_LABEL[planned.kind];
  const stepLoad = (dir: 1 | -1) => {
    if (load === undefined) return;
    const i = loads.findIndex((l) => Math.abs(l - load) < 1e-3);
    const n = loads[Math.max(0, Math.min(loads.length - 1, i + dir))];
    if (n !== undefined) setLoad(n);
  };

  if (logged.done) {
    return (
      <li className="flex items-center gap-3 py-2 px-1 opacity-80">
        <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 grid place-items-center text-sm font-bold">✓</span>
        <div className="flex-1">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="font-medium">
            {logged.reps} {def.kind === 'timed' ? 'dtk' : 'rep'}
            {logged.load !== undefined && def.loadMode && <> · {loadText(def.loadMode, logged.load)}</>}
          </p>
        </div>
        <button className="text-xs text-slate-400 underline" onClick={() => coach.unlogSet(session.id!, exIdx, setIdx)}>
          ubah
        </button>
      </li>
    );
  }

  return (
    <li className={`py-3 px-1 space-y-2 ${isNext ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <span className="font-semibold">{label}</span> <span className="text-slate-400">· target {targetText(def, planned)}</span>
        </p>
        {planned.kind === 'warmup' && <Pill>ringan</Pill>}
      </div>
      {def.loadMode && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Beban</span>
          {load === undefined ? (
            <span className="text-sm text-slate-500">menunggu set kalibrasi</span>
          ) : (
            <div className="flex items-center gap-1">
              <button className="w-10 h-10 rounded-lg bg-slate-800 text-xl" onClick={() => stepLoad(-1)} aria-label="Beban turun">
                −
              </button>
              <span className="min-w-24 text-center font-semibold">{loadText(def.loadMode, load)}</span>
              <button className="w-10 h-10 rounded-lg bg-slate-800 text-xl" onClick={() => stepLoad(1)} aria-label="Beban naik">
                +
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{def.kind === 'timed' ? 'Detik tercapai' : 'Repetisi tercapai'}</span>
        <Stepper value={reps} onChange={setReps} step={def.kind === 'timed' ? 5 : 1} max={300} />
      </div>
      {def.kind === 'timed' && isNext && (
        timer ? (
          <Countdown
            seconds={planned.repMax}
            autoStart
            label="Tahan!"
            onEnd={() => {
              setReps(planned.repMax);
              setTimer(false);
            }}
          />
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setTimer(true)}>
            ⏱ Mulai timer {planned.repMax} dtk
          </Button>
        )
      )}
      <Button
        className="w-full"
        disabled={!isNext || (def.loadMode !== undefined && load === undefined) || reps <= 0}
        onClick={async () => {
          await coach.logSet(session.id!, exIdx, setIdx, { reps, load: def.loadMode ? load : undefined });
          onLogged();
        }}
      >
        ✓ Catat set
      </Button>
    </li>
  );
}

function FeelPicker({ value, onPick }: { value?: Feel; onPick: (f: Feel) => void }) {
  const opts: { f: Feel; label: string; hint: string }[] = [
    { f: 'berat', label: '😮‍💨 Berat', hint: 'hampir gagal' },
    { f: 'pas', label: '👍 Pas', hint: 'sisa 1–3 rep' },
    { f: 'ringan', label: '😎 Ringan', hint: 'masih kuat banyak' },
  ];
  return (
    <Card className="space-y-2">
      <p className="font-semibold">Bagaimana rasanya gerakan ini?</p>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <button
            key={o.f}
            onClick={() => onPick(o.f)}
            className={`rounded-xl py-3 px-1 border ${value === o.f ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-800'}`}
          >
            <div className="font-medium">{o.label}</div>
            <div className="text-xs text-slate-400">{o.hint}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function RestBar({ rest, sound, onDone, onAdd }: { rest: Rest; sound: boolean; onDone: () => void; onAdd: (s: number) => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
  }, [rest.endAt]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((rest.endAt - now) / 1000));
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      if (sound) beep();
      navigator.vibrate?.([300, 150, 300]);
    }
  }, [left, sound]);
  const pct = Math.min(100, ((rest.total - left) / rest.total) * 100);
  return (
    <div className={`rounded-xl px-3 py-2 ${left === 0 ? 'bg-emerald-600/30' : 'bg-slate-800'}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">{left === 0 ? 'Waktunya set berikutnya!' : 'Istirahat'}</span>
        <span className="text-2xl font-bold tabular-nums flex-1 text-center">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
        <button className="text-sm px-2 py-1 rounded bg-slate-700" onClick={() => onAdd(15)}>
          +15
        </button>
        <button className="text-sm px-2 py-1 rounded bg-slate-700" onClick={onDone}>
          {left === 0 ? 'Tutup' : 'Lewati'}
        </button>
      </div>
      <div className="h-1 mt-2 rounded bg-slate-700 overflow-hidden">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Countdown({ seconds, label, autoStart, onEnd }: { seconds: number; label: string; autoStart?: boolean; onEnd?: () => void }) {
  const [endAt, setEndAt] = useState<number | null>(autoStart ? Date.now() + seconds * 1000 : null);
  const [now, setNow] = useState(Date.now());
  const ended = useRef(false);
  useEffect(() => {
    if (!endAt) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [endAt]);
  const left = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : seconds;
  useEffect(() => {
    if (endAt && left === 0 && !ended.current) {
      ended.current = true;
      beep();
      navigator.vibrate?.(400);
      onEnd?.();
    }
  }, [left, endAt, onEnd]);
  return (
    <div className="rounded-xl bg-slate-800 px-3 py-2 flex items-center gap-3">
      <span className="text-sm text-slate-300 flex-1">{label}</span>
      <span className="text-2xl font-bold tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      {!endAt ? (
        <button className="text-sm px-3 py-1 rounded bg-sky-500 text-slate-950 font-semibold" onClick={() => { ended.current = false; setEndAt(Date.now() + seconds * 1000); }}>
          Mulai
        </button>
      ) : (
        <button className="text-sm px-3 py-1 rounded bg-slate-700" onClick={() => setEndAt(null)}>
          Reset
        </button>
      )}
    </div>
  );
}

function Finish({ session }: { session: SessionRecord }) {
  const [pain, setPain] = useState<Record<string, number>>({});
  const loaded = useLiveQuery(() => coach.loadedInjuries(session.id!), [session]);
  const [busy, setBusy] = useState(false);
  const missingPain = (loaded ?? []).some((i) => pain[i.id] === undefined);
  const highPain = (loaded ?? []).some((i) => (pain[i.id] ?? 0) >= 4);
  const doneSets = session.exercises.flatMap((e) => e.logged.filter((l) => l.done && l.kind !== 'warmup').map((l) => ({ e, l })));
  const volume = doneSets.reduce((s, { e, l }) => {
    const def = EXERCISE_BY_ID[e.exerciseId];
    if (!def?.loadMode || l.load === undefined) return s;
    const mult = def.loadMode === 'dumbbellPair' ? 2 : 1;
    return s + l.reps * l.load * mult;
  }, 0);
  const minutes = Math.round((Date.now() - session.startedAt) / 60000);
  const noFeel = session.exercises.filter((e) => !e.skipped && e.logged.some((l) => l.done) && !e.feel);

  return (
    <Shell session={session} title="Sesi selesai 🎉">
      <div className="space-y-3">
        <Card className="grid grid-cols-3 text-center">
          <Stat label="Set" value={String(doneSets.length)} />
          <Stat label="Volume" value={formatKg(Math.round(volume))} />
          <Stat label="Durasi" value={`${minutes} mnt`} />
        </Card>
        {noFeel.length > 0 && (
          <p className="text-sm text-slate-400">
            {noFeel.length} gerakan belum diberi penilaian rasa — dianggap "Pas".
          </p>
        )}
        {loaded && loaded.length > 0 && (
          <Card className="space-y-2">
            <p className="font-semibold">Cek nyeri setelah latihan</p>
            <p className="text-sm text-slate-400">Bagian yang dibebani latihan hari ini.</p>
            <PainChecks injuries={loaded} value={pain} onChange={setPain} />
            {highPain && (
              <p className="text-sm text-rose-300">Catat ya. Kompres dingin & istirahatkan. Kalau besok tidak membaik, periksakan ke dokter/fisioterapis.</p>
            )}
          </Card>
        )}
      </div>
      <BottomBar>
        <Button
          className="w-full"
          disabled={busy || loaded === undefined || missingPain}
          onClick={async () => {
            setBusy(true);
            await coach.finishSession(session.id!, { pain });
          }}
        >
          Simpan & selesai
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => coach.updateSession(session.id!, { cursor: session.exercises.length - 1 })}>
          ‹ Kembali ke gerakan terakhir
        </Button>
      </BottomBar>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function ActiveDay({ session }: { session: SessionRecord }) {
  const [minutes, setMinutes] = useState(30);
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <Shell session={session} title="Hari Aktif">
      <div className="space-y-3">
        <p className="text-slate-300">Tujuan hari ini: bergerak ringan untuk pemulihan & membakar kalori tanpa membebani lutut.</p>
        <Card>
          <ul>
            {MOBILITY_STEPS.map((m, i) => (
              <li key={m}>
                <label className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-sky-500"
                    checked={done.has(i)}
                    onChange={() => {
                      const n = new Set(done);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      setDone(n);
                    }}
                  />
                  <span>{m}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex items-center justify-between">
          <span>Durasi jalan / kardio</span>
          <Stepper value={minutes} onChange={setMinutes} step={5} max={240} suffix="mnt" />
        </Card>
      </div>
      <BottomBar>
        <Button className="w-full" onClick={() => coach.finishActiveDay(session.id!, { minutes, mobility: done.size > 0 })}>
          Simpan hari aktif
        </Button>
      </BottomBar>
    </Shell>
  );
}
