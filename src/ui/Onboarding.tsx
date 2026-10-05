import { useState } from 'react';
import { DEFAULT_EQUIPMENT } from '../coach/plates';
import { coach } from '../data/instance';
import type { Profile } from '../data/db';
import { Button, Card } from './common';

export function Onboarding() {
  const [p, setP] = useState<Profile>({
    age: 28,
    heightCm: 170,
    weightKg: 100,
    experience: 'Pernah latihan gym, berhenti ±1 tahun',
    injuryNote: 'Lutut kiri dalam pemulihan',
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const num = (k: 'age' | 'heightCm' | 'weightKg') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });

  return (
    <div className="min-h-dvh max-w-lg mx-auto px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Halo! Saya coach-mu 👋</h1>
        <p className="text-slate-400 mt-1">Isi data singkat ini supaya program bisa disesuaikan. Semua data hanya disimpan di HP ini.</p>
      </header>

      <Card className="space-y-3">
        <h2 className="font-semibold">Profil</h2>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Usia" suffix="th">
            <input type="number" inputMode="numeric" value={p.age} onChange={num('age')} className="input" />
          </Field>
          <Field label="Tinggi" suffix="cm">
            <input type="number" inputMode="numeric" value={p.heightCm} onChange={num('heightCm')} className="input" />
          </Field>
          <Field label="Berat" suffix="kg">
            <input type="number" inputMode="decimal" value={p.weightKg} onChange={num('weightKg')} className="input" />
          </Field>
        </div>
        <Field label="Pengalaman latihan">
          <input value={p.experience} onChange={(e) => setP({ ...p, experience: e.target.value })} className="input" />
        </Field>
        <Field label="Cedera / keluhan">
          <input value={p.injuryNote} onChange={(e) => setP({ ...p, injuryNote: e.target.value })} className="input" />
        </Field>
      </Card>

      <Card className="space-y-2 text-sm text-slate-300">
        <h2 className="font-semibold text-base text-slate-100">Alat yang terdaftar</h2>
        <p>Pelat: 1,25 kg ×4 · 2,5 kg ×4 · 3 kg ×8 (total 39 kg). Batang dumbel ×2, mur ×4, batang sambungan 40 cm.</p>
        <p className="text-slate-400">Berat batang & mur memakai perkiraan (total ±1 kg). Bisa diubah kapan saja di Pengaturan.</p>
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">Cara kerja program</h2>
        <ul className="list-disc pl-5 space-y-1 text-slate-300">
          <li>Rotasi bergulir: A (Dada+Bicep) → B (Back+Tricep) → C (Lower) → Hari Aktif. Hari terlewat tinggal dilanjutkan.</li>
          <li>2 minggu pertama = kalibrasi & adaptasi, sengaja ringan.</li>
          <li>Beban naik otomatis kalau semua set mencapai target repetisi.</li>
          <li>Lutut dicek sebelum & sesudah latihan kaki.</li>
        </ul>
      </Card>

      <label className="flex gap-3 items-start text-sm text-slate-300">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-5 h-5 accent-sky-500" />
        <span>
          Saya paham aplikasi ini bukan pengganti dokter/fisioterapis. Kalau nyeri lutut (atau nyeri lain) muncul lagi atau memburuk, saya akan berhenti dan
          memeriksakannya.
        </span>
      </label>

      <Button
        className="w-full"
        disabled={!agree || busy || !p.age || !p.heightCm || !p.weightKg}
        onClick={async () => {
          setBusy(true);
          await coach.completeOnboarding(p, DEFAULT_EQUIPMENT);
        }}
      >
        Mulai Program
      </Button>
    </div>
  );
}

export function Field({ label, suffix, children }: { label: string; suffix?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">
        {label}
        {suffix && <span className="text-slate-500"> ({suffix})</span>}
      </span>
      {children}
    </label>
  );
}
