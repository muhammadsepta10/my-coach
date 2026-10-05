import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { exerciseFrames } from '../ui/exerciseImages';
import { EXERCISES, exercisesForDay } from './program';

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

  it('tiap hari punya gerakan utama dan 2 gerakan core', () => {
    for (const d of ['A', 'B', 'C'] as const) {
      const list = exercisesForDay(d);
      expect(list.filter((e) => e.block === 'main').length).toBeGreaterThanOrEqual(5);
      expect(list.filter((e) => e.block === 'core')).toHaveLength(2);
    }
  });

  it('tanpa bench: tidak ada bench press atau dip', () => {
    const names = EXERCISES.map((e) => e.name.toLowerCase()).join(' ');
    expect(names).not.toMatch(/bench press|dip/);
  });
});
