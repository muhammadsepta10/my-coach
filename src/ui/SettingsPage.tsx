import { useRef, useState } from 'react';
import { type EquipmentConfig, type LoadMode, achievableLoads, barWeight, formatKg } from '../coach/plates';
import type { Profile, Settings } from '../data/db';
import { coach } from '../data/instance';
import { Field } from './Onboarding';
import { Button, Card } from './common';

export function SettingsPage({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pengaturan</h1>
      <ProfileForm initial={settings.profile} />
      <EquipmentForm initial={settings.equipment} />
      <ProgramCard settings={settings} />
      <BackupCard />
      <p className="text-xs text-slate-600 text-center pb-4">My Coach · data tersimpan hanya di perangkat ini</p>
    </div>
  );
}

function ProfileForm({ initial }: { initial: Profile }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Profil</h2>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Usia">
          <input type="number" className="input" value={p.age} onChange={(e) => setP({ ...p, age: +e.target.value })} />
        </Field>
        <Field label="Tinggi (cm)">
          <input type="number" className="input" value={p.heightCm} onChange={(e) => setP({ ...p, heightCm: +e.target.value })} />
        </Field>
        <Field label="Berat (kg)">
          <input type="number" className="input" value={p.weightKg} onChange={(e) => setP({ ...p, weightKg: +e.target.value })} />
        </Field>
      </div>
      <Field label="Cedera / keluhan">
        <input className="input" value={p.injuryNote} onChange={(e) => setP({ ...p, injuryNote: e.target.value })} />
      </Field>
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          await coach.saveSettings({ profile: p });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? 'Tersimpan ✓' : 'Simpan profil'}
      </Button>
    </Card>
  );
}

function EquipmentForm({ initial }: { initial: EquipmentConfig }) {
  const [e, setE] = useState<EquipmentConfig>(structuredClone(initial));
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<LoadMode>('dumbbellPair');
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);
  const totalPlates = e.plates.reduce((s, p) => s + p.weight * p.count, 0);
  const hardware = 2 * e.handleWeight + e.connectorWeight + 4 * e.collarWeight;
  const loads = achievableLoads(e, preview);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Alat</h2>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-400">
          <span>Berat pelat (kg)</span>
          <span>Jumlah</span>
          <span />
        </div>
        {e.plates.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              className="input mt-0"
              value={p.weight}
              onChange={(ev) => {
                const plates = [...e.plates];
                plates[i] = { ...p, weight: num(ev.target.value) };
                setE({ ...e, plates });
              }}
            />
            <input
              type="number"
              inputMode="numeric"
              className="input mt-0"
              value={p.count}
              onChange={(ev) => {
                const plates = [...e.plates];
                plates[i] = { ...p, count: Math.round(num(ev.target.value)) };
                setE({ ...e, plates });
              }}
            />
            <button className="text-rose-400 px-2" aria-label="Hapus pelat" onClick={() => setE({ ...e, plates: e.plates.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <Button variant="ghost" className="px-0 py-1" onClick={() => setE({ ...e, plates: [...e.plates, { weight: 1, count: 2 }] })}>
          + Tambah jenis pelat
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Batang dumbel (kg)">
          <input type="number" step="0.05" className="input" value={e.handleWeight} onChange={(ev) => setE({ ...e, handleWeight: num(ev.target.value) })} />
        </Field>
        <Field label="Mur (kg)">
          <input type="number" step="0.025" className="input" value={e.collarWeight} onChange={(ev) => setE({ ...e, collarWeight: num(ev.target.value) })} />
        </Field>
        <Field label="Sambungan (kg)">
          <input type="number" step="0.05" className="input" value={e.connectorWeight} onChange={(ev) => setE({ ...e, connectorWeight: num(ev.target.value) })} />
        </Field>
        <Field label="Maks pelat/sisi dumbel">
          <input
            type="number"
            className="input"
            value={e.maxPlatesPerSideDumbbell}
            onChange={(ev) => setE({ ...e, maxPlatesPerSideDumbbell: Math.max(1, Math.round(num(ev.target.value))) })}
          />
        </Field>
        <Field label="Maks pelat/sisi barbel">
          <input
            type="number"
            className="input"
            value={e.maxPlatesPerSideBarbell}
            onChange={(ev) => setE({ ...e, maxPlatesPerSideBarbell: Math.max(1, Math.round(num(ev.target.value))) })}
          />
        </Field>
      </div>
      <p className="text-sm text-slate-400">
        Total pelat {formatKg(totalPlates)} + batang & mur {formatKg(Math.round(hardware * 1000) / 1000)} = <b>{formatKg(Math.round((totalPlates + hardware) * 100) / 100)}</b>.
        Barbel kosong {formatKg(barWeight(e, 'barbell'))}, dumbel kosong {formatKg(barWeight(e, 'dumbbell'))}.
      </p>
      <div>
        <div className="flex gap-1 mb-2">
          {(
            [
              ['dumbbellPair', '2 dumbel'],
              ['dumbbellSingle', '1 dumbel'],
              ['barbell', 'Barbel'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} onClick={() => setPreview(m)} className={`text-xs rounded-full px-3 py-1 ${preview === m ? 'bg-sky-500 text-slate-950' : 'bg-slate-800'}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-1">Beban yang bisa dipasang{preview === 'dumbbellPair' ? ' (per dumbel)' : ''}:</p>
        <div className="flex flex-wrap gap-1">
          {loads.map((l) => (
            <span key={l.total} className="text-xs bg-slate-800 rounded px-1.5 py-0.5 tabular-nums" title={l.perSide.join(' + ')}>
              {l.total.toLocaleString('id-ID')}
            </span>
          ))}
        </div>
      </div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          await coach.saveSettings({ equipment: { ...e, plates: e.plates.filter((p) => p.weight > 0 && p.count > 0) } });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? 'Tersimpan ✓' : 'Simpan alat'}
      </Button>
    </Card>
  );
}

function ProgramCard({ settings }: { settings: Settings }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Program</h2>
      <div className="flex items-center justify-between">
        <span>Fase</span>
        <div className="flex gap-1">
          {([1, 2] as const).map((ph) => (
            <button
              key={ph}
              onClick={() => coach.saveSettings({ phase: ph })}
              className={`rounded-lg px-3 py-1.5 text-sm ${settings.phase === ph ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-800'}`}
            >
              Fase {ph}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">Fase 1: A-B-C-Aktif. Fase 2: A-B-C-A-B-C-Aktif. Coach akan menawarkan Fase 2 otomatis kalau sudah siap.</p>
      <label className="flex items-center justify-between">
        <span>Bunyi timer</span>
        <input type="checkbox" className="w-5 h-5 accent-sky-500" checked={settings.sound} onChange={(e) => coach.saveSettings({ sound: e.target.checked })} />
      </label>
    </Card>
  );
}

function BackupCard() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string>();
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Backup data</h2>
      <p className="text-sm text-slate-400">Data hanya tersimpan di browser HP ini. Ekspor rutin supaya tidak hilang kalau ganti HP atau data browser terhapus.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            const json = await coach.exportData();
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `my-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            setMsg('Backup diunduh.');
          }}
        >
          Ekspor
        </Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>
          Impor
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          if (!confirm('Impor akan MENGGANTI semua data saat ini. Lanjutkan?')) return;
          try {
            await coach.importData(await f.text());
            setMsg('Data berhasil diimpor.');
          } catch (err) {
            setMsg(`Gagal impor: ${(err as Error).message}`);
          }
          ev.target.value = '';
        }}
      />
      {msg && <p className="text-sm text-sky-300">{msg}</p>}
      <Button
        variant="danger"
        className="w-full"
        onClick={async () => {
          if (confirm('Hapus SEMUA data dan mulai dari awal? Tindakan ini tidak bisa dibatalkan.')) await coach.resetAll();
        }}
      >
        Hapus semua data
      </Button>
    </Card>
  );
}
