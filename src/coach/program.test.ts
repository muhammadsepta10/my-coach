import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { exerciseFrames } from '../ui/exerciseImages';
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

  it('bank: ±53 gerakan, 23 gerakan asli tetap ada', () => {
    expect(EXERCISES).toHaveLength(53);
    expect(DEFAULT_IDS.size).toBe(23);
  });

  it('setiap gerakan utama ada di tepat satu slot, sesuai slot di definisinya', () => {
    for (const e of EXERCISES.filter((x) => x.block === 'main')) {
      const holders = SLOTS.filter((s) => s.candidates.includes(e.id));
      expect(holders.map((s) => s.id), e.id).toEqual([e.slot]);
    }
    for (const s of SLOTS) {
      for (const id of s.candidates) expect(EXERCISE_BY_ID[id], id).toBeDefined();
      expect(DEFAULT_IDS.has(s.candidates[0]), `${s.id} default`).toBe(true);
    }
  });

  it('slot primer & aksesori punya 2–3 alternatif', () => {
    for (const s of SLOTS.filter((x) => x.role !== 'optional')) {
      expect(s.candidates.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.candidates.length, s.id).toBeLessThanOrEqual(3);
    }
  });

  it('gerakan kaki punya tingkat beban lutut', () => {
    for (const e of EXERCISES.filter((x) => SLOT_BY_ID[x.slot]?.day === 'C')) {
      expect(e.kneeTier, e.id).toBeDefined();
    }
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
