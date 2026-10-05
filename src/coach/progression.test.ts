import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from './plates';
import { applyCalibration, initialState, progress } from './progression';
import type { ExerciseDef, ExerciseState } from './types';

const press: ExerciseDef = {
  id: 'press',
  name: 'Press',
  slot: 'A1',
  block: 'main',
  kind: 'weighted',
  loadMode: 'dumbbellPair',
  sets: 3,
  repMin: 8,
  repMax: 12,
  restSec: 90,
  calibrationLoad: 8,
  muscles: '',
  cues: [],
  mistakes: [],
  youtubeQuery: '',
};

const pushup: ExerciseDef = {
  ...press,
  id: 'pushup',
  kind: 'reps',
  loadMode: undefined,
  repMin: 6,
  repMax: 15,
  variants: ['Incline', 'Lantai'],
};

const plank: ExerciseDef = {
  ...press,
  id: 'plank',
  kind: 'timed',
  loadMode: undefined,
  repMin: 20,
  repMax: 45,
};

const eq = DEFAULT_EQUIPMENT;

function weighted(load: number, over: Partial<ExerciseState> = {}): ExerciseState {
  return { ...initialState(press), load, calibrated: true, ...over };
}

describe('initialState', () => {
  it('beban belum terkalibrasi', () => {
    const s = initialState(press);
    expect(s.calibrated).toBe(false);
    expect(s.repMin).toBe(8);
    expect(s.repMax).toBe(12);
  });
  it('timed mulai dari detik terendah', () => {
    const s = initialState(plank);
    expect(s.repMax).toBe(20);
  });
});

describe('applyCalibration', () => {
  it('menghitung beban kerja dari set kalibrasi, dibulatkan ke bawah', () => {
    // 7,9 kg × 15 reps (+2 RIR) → e1RM ≈ 12,38; target 8 reps + 3 RIR → ≈ 9,06 → 8,9 kg
    const s = applyCalibration(press, initialState(press), eq, { load: 7.9, reps: 15 }, 3);
    expect(s.calibrated).toBe(true);
    expect(s.load).toBeCloseTo(8.9);
    expect(s.e1rm).toBeGreaterThan(0);
  });
});

describe('progress (beban)', () => {
  it('naik ke beban berikutnya kalau semua set mencapai batas atas', () => {
    const s = progress(press, weighted(6.4), eq, {
      sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
      feel: 'pas',
    });
    expect(s.load).toBeCloseTo(7.9);
    expect(s.stallStreak).toBe(0);
  });

  it('tidak naik kalau terasa berat walau target tercapai', () => {
    const s = progress(press, weighted(6.4), eq, {
      sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
      feel: 'berat',
    });
    expect(s.load).toBeCloseTo(6.4);
  });

  it('"ringan" boleh naik kalau semua set kurang maksimal 1 rep', () => {
    const s = progress(press, weighted(6.4), eq, {
      sets: [{ reps: 12 }, { reps: 11 }, { reps: 11 }],
      feel: 'ringan',
    });
    expect(s.load).toBeCloseTo(7.9);
  });

  it('tetap di beban sama kalau repetisi di dalam rentang', () => {
    const s = progress(press, weighted(6.4, { lastTotalReps: 30 }), eq, {
      sets: [{ reps: 11 }, { reps: 10 }, { reps: 10 }],
      feel: 'pas',
    });
    expect(s.load).toBeCloseTo(6.4);
    expect(s.stallStreak).toBe(0);
    expect(s.lastTotalReps).toBe(31);
  });

  it('menghitung stagnan kalau total repetisi tidak bertambah', () => {
    const s = progress(press, weighted(6.4, { lastTotalReps: 31 }), eq, {
      sets: [{ reps: 11 }, { reps: 10 }, { reps: 10 }],
      feel: 'pas',
    });
    expect(s.stallStreak).toBe(1);
  });

  it('turun satu tingkat setelah 2 sesi gagal mencapai repMin', () => {
    let s = weighted(7.9);
    const fail = { sets: [{ reps: 7 }, { reps: 6 }, { reps: 6 }], feel: 'berat' as const };
    s = progress(press, s, eq, fail);
    expect(s.load).toBeCloseTo(7.9);
    s = progress(press, s, eq, fail);
    expect(s.load).toBeCloseTo(6.4);
    expect(s.missStreak).toBe(0);
  });

  it('di beban maksimal: rentang repetisi digeser naik', () => {
    const s = progress(press, weighted(19.9), eq, {
      sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }],
      feel: 'pas',
    });
    expect(s.load).toBeCloseTo(19.9);
    expect(s.repMin).toBe(10);
    expect(s.repMax).toBe(14);
  });

  it('di beban maksimal dan repetisi sudah 20: pakai tempo lambat', () => {
    const s = progress(press, weighted(19.9, { repMin: 16, repMax: 20 }), eq, {
      sets: [{ reps: 20 }, { reps: 20 }, { reps: 20 }],
      feel: 'pas',
    });
    expect(s.tempo).toBe(true);
    expect(s.repMax).toBe(20);
  });

  it('memperbarui e1RM dari set terbaik sesi itu', () => {
    const s = progress(press, weighted(6.4), eq, {
      sets: [{ reps: 12, load: 6.4 }, { reps: 10, load: 6.4 }],
      feel: 'pas',
    });
    expect(s.e1rm).toBeCloseTo(6.4 * (1 + 12 / 30));
  });
});

describe('progress (bodyweight)', () => {
  it('naik ke variasi berikutnya dan rentang direset', () => {
    const s = progress(pushup, { ...initialState(pushup), repMin: 6, repMax: 15 }, eq, {
      sets: [{ reps: 15 }, { reps: 15 }],
      feel: 'pas',
    });
    expect(s.variant).toBe(1);
    expect(s.repMin).toBe(6);
  });
  it('di variasi terakhir: rentang repetisi digeser', () => {
    const s = progress(pushup, { ...initialState(pushup), variant: 1 }, eq, {
      sets: [{ reps: 15 }, { reps: 15 }],
      feel: 'pas',
    });
    expect(s.variant).toBe(1);
    expect(s.repMax).toBe(17);
  });
});

describe('progress (timed)', () => {
  it('+5 detik kalau semua set berhasil', () => {
    const s = progress(plank, initialState(plank), eq, {
      sets: [{ reps: 20 }, { reps: 22 }],
      feel: 'pas',
    });
    expect(s.repMax).toBe(25);
  });
  it('tidak melewati batas', () => {
    const s = progress(plank, { ...initialState(plank), repMax: 45 }, eq, {
      sets: [{ reps: 45 }, { reps: 45 }],
      feel: 'pas',
    });
    expect(s.repMax).toBe(45);
  });
});
