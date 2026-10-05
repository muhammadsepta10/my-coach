import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { epley } from '../coach/e1rm';
import { formatKg } from '../coach/plates';
import { DAY_LABEL, EXERCISES, EXERCISE_BY_ID } from '../coach/program';
import type { SessionRecord } from '../data/db';
import { coach } from '../data/instance';
import { Card, Pill, formatDate } from './common';

const AXIS = { stroke: '#64748b', fontSize: 11 };
const TOOLTIP = { contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }, labelStyle: { color: '#cbd5e1' } };

function sessionVolume(s: SessionRecord): number {
  return s.exercises.reduce((sum, e) => {
    const def = EXERCISE_BY_ID[e.exerciseId];
    if (!def?.loadMode) return sum;
    const mult = def.loadMode === 'dumbbellPair' ? 2 : 1;
    return sum + e.logged.filter((l) => l.done && l.kind !== 'warmup' && l.load !== undefined).reduce((v, l) => v + l.reps * l.load! * mult, 0);
  }, 0);
}

export function History() {
  const history = useLiveQuery(() => coach.history(), []);
  const weights = useLiveQuery(() => coach.bodyWeights(), []);
  const weighted = EXERCISES.filter((e) => e.kind === 'weighted');
  const [exId, setExId] = useState(weighted[0].id);

  const e1rmData = useMemo(() => {
    if (!history) return [];
    return [...history]
      .reverse()
      .map((s) => {
        const ex = s.exercises.find((e) => e.exerciseId === exId);
        if (!ex) return null;
        const best = Math.max(0, ...ex.logged.filter((l) => l.done && l.kind !== 'warmup' && l.load).map((l) => epley(l.load!, l.reps)));
        return best > 0 ? { date: formatDate(s.date), e1rm: Math.round(best * 10) / 10 } : null;
      })
      .filter((x): x is { date: string; e1rm: number } => x !== null);
  }, [history, exId]);

  const volData = useMemo(
    () =>
      (history ?? [])
        .filter((s) => s.dayType !== 'AKTIF')
        .slice(0, 20)
        .reverse()
        .map((s) => ({ date: formatDate(s.date), hari: s.dayType, volume: Math.round(sessionVolume(s)) })),
    [history],
  );

  const bwData = (weights ?? []).map((w) => ({ date: formatDate(w.date), kg: w.kg }));
  const mode = EXERCISE_BY_ID[exId]?.loadMode;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Progres</h1>

      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Estimasi 1RM</h2>
          <select value={exId} onChange={(e) => setExId(e.target.value)} className="bg-slate-800 rounded-lg px-2 py-1 text-sm max-w-[60%]">
            {weighted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        {mode === 'dumbbellPair' && <p className="text-xs text-slate-500">Per dumbel.</p>}
        {e1rmData.length < 1 ? (
          <Empty />
        ) : (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={e1rmData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="date" {...AXIS} />
                <YAxis {...AXIS} domain={['auto', 'auto']} />
                <Tooltip {...TOOLTIP} formatter={(v) => [formatKg(Number(v)), 'e1RM']} />
                <Line dataKey="e1rm" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Volume per sesi (kg × rep)</h2>
        {volData.length < 1 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={volData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip {...TOOLTIP} formatter={(v) => [formatKg(Number(v)), 'Volume']} />
                <Bar dataKey="volume" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Berat badan</h2>
        {bwData.length < 1 ? (
          <Empty />
        ) : (
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={bwData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="date" {...AXIS} />
                <YAxis {...AXIS} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip {...TOOLTIP} formatter={(v) => [formatKg(Number(v)), 'Berat']} />
                <Line dataKey="kg" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <h2 className="font-semibold pt-2">Riwayat sesi</h2>
      {history?.length === 0 && <p className="text-slate-500 text-sm">Belum ada sesi. Ayo mulai latihan pertamamu!</p>}
      <ul className="space-y-2">
        {history?.map((s) => (
          <SessionItem key={s.id} s={s} />
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-500 py-6 text-center">Belum ada data.</p>;
}

function SessionItem({ s }: { s: SessionRecord }) {
  const [open, setOpen] = useState(false);
  const sets = s.exercises.reduce((n, e) => n + e.logged.filter((l) => l.done && l.kind !== 'warmup').length, 0);
  return (
    <li>
      <Card className="p-3">
        <button className="w-full text-left" onClick={() => setOpen(!open)}>
          <div className="flex items-center justify-between">
            <span className="font-medium">{DAY_LABEL[s.dayType]}</span>
            <span className="text-sm text-slate-400">{formatDate(s.date)}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {s.dayType === 'AKTIF' ? (
              <Pill tone="emerald">{s.activeMinutes ?? 0} menit</Pill>
            ) : (
              <>
                <Pill>{sets} set</Pill>
                <Pill>{formatKg(Math.round(sessionVolume(s)))}</Pill>
              </>
            )}
            {s.deload && <Pill tone="amber">deload</Pill>}
            {s.kneePre !== undefined && <Pill tone={s.kneePre >= 4 ? 'rose' : 'slate'}>lutut pra {s.kneePre}</Pill>}
            {s.kneePost !== undefined && <Pill tone={s.kneePost >= 4 ? 'rose' : 'slate'}>pasca {s.kneePost}</Pill>}
            {s.kneeNextDay !== undefined && <Pill tone={s.kneeNextDay >= 4 ? 'rose' : 'slate'}>besok {s.kneeNextDay}</Pill>}
          </div>
        </button>
        {open && s.dayType !== 'AKTIF' && (
          <ul className="mt-3 space-y-2 text-sm">
            {s.exercises.map((e) => {
              const def = EXERCISE_BY_ID[e.exerciseId];
              const done = e.logged.filter((l) => l.done && l.kind !== 'warmup');
              return (
                <li key={e.exerciseId}>
                  <p className="font-medium">
                    {e.displayName} {e.skipped && <Pill>dilewati</Pill>} {e.feel && <Pill tone="sky">{e.feel}</Pill>}
                  </p>
                  <p className="text-slate-400">
                    {done.length === 0
                      ? '—'
                      : done.map((l) => `${l.reps}${def?.kind === 'timed' ? 'dtk' : ''}${l.load !== undefined ? `×${l.load.toLocaleString('id-ID')}` : ''}`).join(', ')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </li>
  );
}
