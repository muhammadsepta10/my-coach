import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { exerciseFrames } from '../ui/exerciseImages';
import { BODY_AREAS } from './injury';
import { CORE_POOL, DEFAULT_IDS, EXERCISES, EXERCISE_BY_ID, SLOTS, SLOT_BY_ID, exercisesForDay } from './program';

describe('program', () => {
  it('setiap gerakan punya 2 frame gambar (awal & akhir)', () => {
    for (const e of EXERCISES) {
      const [a, b] = exerciseFrames(e.id, '/');
      expect(existsSync(`public${a}`), a).toBe(true);
      expect(existsSync(`public${b}`), b).toBe(true);
    }
  });

  it('gerakan berbeban punya mode alat & beban kalibrasi', () => {
    for (const e of EXERCISES.filter((x) => x.kind === 'weighted')) {
      expect(e.loadMode, e.id).toBeDefined();
      expect(e.calibrationLoad, e.id).toBeGreaterThan(0);
    }
  });

  it('id unik dan petunjuk lengkap', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.cues.length, e.id).toBeGreaterThan(0);
      expect(e.mistakes.length, e.id).toBeGreaterThan(0);
      expect(e.youtubeQuery, e.id).not.toBe('');
    }
  });

  it('tiap hari punya minimal 5 slot dengan gerakan', () => {
    for (const d of ['A', 'B', 'C'] as const) {
      expect(SLOTS.filter((s) => s.day === d).length, d).toBeGreaterThanOrEqual(5);
      expect(exercisesForDay(d).every((e) => e.block === 'main')).toBe(true);
    }
  });

  it('bank: 73 gerakan, 23 gerakan asli tetap ada', () => {
    expect(EXERCISES).toHaveLength(73);
    expect(DEFAULT_IDS.size).toBe(23);
  });

  it('setiap gerakan utama ada di tepat satu slot, sesuai slot di definisinya', () => {
    for (const e of EXERCISES.filter((x) => x.block === 'main')) {
      const holders = SLOTS.filter((s) => s.candidates.includes(e.id));
      expect(holders.map((s) => s.id), e.id).toEqual([e.slot]);
    }
    for (const s of SLOTS) {
      for (const id of s.candidates) expect(EXERCISE_BY_ID[id], id).toBeDefined();
      if (s.id !== 'C6') expect(DEFAULT_IDS.has(s.candidates[0]), `${s.id} default`).toBe(true);
    }
  });

  it('slot primer & aksesori punya minimal 2 alternatif', () => {
    for (const s of SLOTS.filter((x) => x.role !== 'optional')) {
      expect(s.candidates.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('setiap gerakan punya beban area yang valid', () => {
    for (const e of EXERCISES) {
      const entries = Object.entries(e.load ?? {});
      expect(entries.length, e.id).toBeGreaterThan(0);
      for (const [area, level] of entries) {
        expect(BODY_AREAS, `${e.id}: ${area}`).toContain(area);
        expect(['ringan', 'sedang', 'berat'], `${e.id}: ${area}`).toContain(level);
      }
    }
  });

  it('gerakan hari C membebani minimal satu area kaki/pinggul', () => {
    const legAreas = ['lutut', 'engkel', 'pinggul', 'punggung-bawah', 'tulang-kering'];
    for (const e of EXERCISES.filter((x) => SLOT_BY_ID[x.slot]?.day === 'C')) {
      expect(Object.keys(e.load ?? {}).some((a) => legAreas.includes(a)), e.id).toBe(true);
    }
  });

  it('20 gerakan kaki baru ada di slotnya', () => {
    const baru: Record<string, string[]> = {
      C1: ['sumo-goblet-squat', 'heels-elevated-goblet-squat', 'tempo-goblet-box-squat'],
      C2: ['sumo-db-deadlift', 'b-stance-db-rdl', 'db-good-morning'],
      C3: ['barbell-hip-thrust', 'db-frog-pump', 'b-stance-db-hip-thrust'],
      C4: ['bulgarian-split-squat', 'lateral-lunge', 'cossack-squat', 'step-down'],
      C5: ['tibialis-raise', 'donkey-calf-raise'],
      C6: ['elevated-hamstring-bridge', 'prone-db-leg-curl', 'side-lying-leg-raise', 'clamshell', 'copenhagen-plank'],
    };
    expect(Object.values(baru).flat()).toHaveLength(20);
    for (const [slot, ids] of Object.entries(baru)) {
      for (const id of ids) expect(SLOT_BY_ID[slot].candidates, `${slot} ${id}`).toContain(id);
    }
  });

  it('slot baru Hamstring & paha samping: aksesori hari C dengan default Elevated Hamstring Bridge', () => {
    expect(SLOT_BY_ID.C6).toMatchObject({ day: 'C', role: 'accessory', label: 'Hamstring & paha samping' });
    expect(SLOT_BY_ID.C6.candidates[0]).toBe('elevated-hamstring-bridge');
    expect(SLOT_BY_ID.C5.label).toBe('Betis & tulang kering');
  });

  it('kolam core: 10 gerakan, anti-gerakan & lainnya, carry butuh dumbel', () => {
    expect(CORE_POOL).toHaveLength(10);
    expect(CORE_POOL.filter((e) => e.coreType === 'anti').map((e) => e.id).sort()).toEqual(
      ['bear-plank', 'bird-dog', 'dead-bug', 'hollow-hold', 'plank'],
    );
    for (const e of CORE_POOL) expect(e.coreType, e.id).toBeDefined();
    expect(CORE_POOL.filter((e) => e.carry).every((e) => e.coreType === 'other')).toBe(true);
  });

  it('saudara merujuk gerakan berbeban yang ada, rasio positif', () => {
    for (const e of EXERCISES) {
      for (const s of e.siblings ?? []) {
        expect(EXERCISE_BY_ID[s.id], `${e.id} → ${s.id}`).toBeDefined();
        expect(EXERCISE_BY_ID[s.id].kind, s.id).toBe('weighted');
        expect(s.ratio, e.id).toBeGreaterThan(0);
      }
    }
  });

  it('tanpa alat lain: tidak ada towel row, band, atau pull-up bar', () => {
    const text = EXERCISES.map((e) => `${e.name} ${e.cues.join(' ')}`.toLowerCase()).join(' ');
    expect(text).not.toMatch(/towel|handuk di pintu|band|pull-up bar/);
  });

  it('tanpa bench: tidak ada bench press atau dip', () => {
    const names = EXERCISES.map((e) => e.name.toLowerCase()).join(' ');
    expect(names).not.toMatch(/bench press|dip/);
  });
});
