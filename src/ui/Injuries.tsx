import { useState } from 'react';
import {
  AREA_LABEL,
  type AreaLoad,
  BODY_AREAS,
  type BodyArea,
  type Injury,
  type InjuryStatus,
  PAIRED_AREAS,
  STATUS_LABEL,
  type Side,
  injuryName,
} from '../coach/injury';
import { coach } from '../data/instance';
import { Button, PainScale, Pill } from './common';

const STATUS_HINT: Record<InjuryStatus, string> = {
  akut: 'gerakan yang membebani area ini tidak dipilih',
  pemulihan: 'hanya gerakan ringan, dibuka bertahap saat nyeri stabil',
  pulih: 'semua gerakan boleh, nyeri tetap dipantau',
};

const STATUS_TONE: Record<InjuryStatus, 'rose' | 'amber' | 'emerald'> = { akut: 'rose', pemulihan: 'amber', pulih: 'emerald' };

export function StatusPill({ status }: { status: InjuryStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pilihan Akut / Pemulihan / Pulih */
export function StatusPicker({ value, onChange }: { value: InjuryStatus; onChange: (s: InjuryStatus) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['akut', 'pemulihan', 'pulih'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded-lg py-2 text-sm font-medium border ${value === s ? 'border-sky-500 bg-sky-500/15' : 'border-slate-700 bg-slate-800'}`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** Form tambah cedera: area, sisi (kalau berpasangan), status. */
export function InjuryForm({ onDone, onCancel }: { onDone: (i: Injury) => void; onCancel?: () => void }) {
  const [area, setArea] = useState<BodyArea>('lutut');
  const [side, setSide] = useState<Side>('kiri');
  const [status, setStatus] = useState<InjuryStatus>('akut');
  const paired = PAIRED_AREAS.has(area);
  return (
    <div className="space-y-3 rounded-xl bg-slate-800/60 p-3">
      <label className="block text-sm">
        Area
        <select className="input" value={area} onChange={(e) => setArea(e.target.value as BodyArea)}>
          {BODY_AREAS.map((a) => (
            <option key={a} value={a}>
              {capitalize(AREA_LABEL[a])}
            </option>
          ))}
        </select>
      </label>
      {paired && (
        <div className="grid grid-cols-2 gap-1">
          {(['kiri', 'kanan'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-lg py-2 text-sm border ${side === s ? 'border-sky-500 bg-sky-500/15' : 'border-slate-700 bg-slate-800'}`}
            >
              {capitalize(s)}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <StatusPicker value={status} onChange={setStatus} />
        <p className="text-xs text-slate-400">{STATUS_HINT[status]}</p>
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Batal
          </Button>
        )}
        <Button className="flex-1" onClick={async () => onDone(await coach.addInjury({ area, side: paired ? side : undefined, status }))}>
          Simpan cedera
        </Button>
      </div>
    </div>
  );
}

/** Daftar cedera aktif dengan pengubah status (dan tombol sembuh kalau `full`). */
export function InjuryList({ injuries, full = false }: { injuries: Injury[]; full?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (injuries.length === 0) return <p className="text-sm text-slate-400">Tidak ada cedera aktif.</p>;
  return (
    <ul className="space-y-2">
      {injuries.map((i) => (
        <li key={i.id} className="rounded-xl bg-slate-800/60 px-3 py-2">
          <button className="w-full flex items-center justify-between text-left" onClick={() => setEditing(editing === i.id ? null : i.id)}>
            <span className="font-medium">{capitalize(injuryName(i))}</span>
            <StatusPill status={i.status} />
          </button>
          {editing === i.id && (
            <div className="mt-2 space-y-2">
              <StatusPicker value={i.status} onChange={(s) => coach.setInjuryStatus(i.id, s)} />
              <p className="text-xs text-slate-400">{STATUS_HINT[i.status]}</p>
              {full && (
                <Button variant="secondary" className="w-full" onClick={() => coach.healInjury(i.id)}>
                  ✓ Tandai sembuh
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const LOAD_ORDER = { berat: 0, sedang: 1, ringan: 2 } as const;

/** "Beban: lutut berat · engkel sedang" */
export function AreaLoadText({ load, className = '' }: { load?: AreaLoad; className?: string }) {
  const entries = Object.entries(load ?? {}).sort((a, b) => LOAD_ORDER[a[1]] - LOAD_ORDER[b[1]]);
  if (!entries.length) return null;
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      Beban: {entries.map(([a, l]) => `${AREA_LABEL[a as BodyArea]} ${l}`).join(' · ')}
    </p>
  );
}

/** Cek nyeri 0–10 untuk sejumlah cedera; mengembalikan skor per id cedera. */
export function PainChecks({
  injuries,
  value,
  onChange,
}: {
  injuries: Injury[];
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <div className="space-y-4">
      {injuries.map((i) => (
        <div key={i.id} className="space-y-1">
          <p className="text-sm font-medium">
            {capitalize(injuryName(i))} <StatusPill status={i.status} />
          </p>
          <PainScale value={value[i.id]} onChange={(v) => onChange({ ...value, [i.id]: v })} />
        </div>
      ))}
    </div>
  );
}
