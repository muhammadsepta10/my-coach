import { describe, expect, it } from 'vitest';
import { daysBetween, addDays } from './dates';
import { nextDay, phase2Eligible, SEQUENCES } from './rotation';
import { kneeModifier, stepUpUnlocked } from './knee';
import { deloadSets, isDeloadActive, shouldDeload } from './deload';
import { orderExercises } from './ordering';
import { warmupSets } from './warmup';
import { DEFAULT_EQUIPMENT } from './plates';
import type { ExerciseDef } from './types';

describe('dates', () => {
  it('menghitung selisih hari', () => {
    expect(daysBetween('2026-10-01', '2026-10-05')).toBe(4);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('nextDay (rotasi bergulir)', () => {
  it('mulai dari A', () => {
    expect(nextDay(undefined, 1)).toEqual({ dayType: 'A', seqIndex: 0 });
  });
  it('fase 1: A → B → C → AKTIF → A', () => {
    expect(nextDay({ dayType: 'C', seqIndex: 2, phase: 1 }, 1)).toEqual({ dayType: 'AKTIF', seqIndex: 3 });
    expect(nextDay({ dayType: 'AKTIF', seqIndex: 3, phase: 1 }, 1)).toEqual({ dayType: 'A', seqIndex: 0 });
  });
  it('fase 2: A B C A B C AKTIF', () => {
    expect(SEQUENCES[2]).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'AKTIF']);
    expect(nextDay({ dayType: 'C', seqIndex: 2, phase: 2 }, 2)).toEqual({ dayType: 'A', seqIndex: 3 });
  });
  it('ganti fase: lanjut setelah hari terakhir yang sama', () => {
    expect(nextDay({ dayType: 'B', seqIndex: 1, phase: 1 }, 2)).toEqual({ dayType: 'C', seqIndex: 2 });
    expect(nextDay({ dayType: 'AKTIF', seqIndex: 3, phase: 1 }, 2)).toEqual({ dayType: 'A', seqIndex: 0 });
  });
});

describe('phase2Eligible', () => {
  const base = { phase: 1 as const, programStart: '2026-01-01', today: '2026-02-15', recentKneeScores: [1, 2, 1, 0] };
  it('ya setelah 6 minggu dan lutut stabil', () => {
    expect(phase2Eligible(base)).toBe(true);
  });
  it('tidak sebelum 6 minggu', () => {
    expect(phase2Eligible({ ...base, today: '2026-02-01' })).toBe(false);
  });
  it('tidak kalau rata-rata nyeri lutut > 2', () => {
    expect(phase2Eligible({ ...base, recentKneeScores: [3, 3, 2, 3] })).toBe(false);
  });
  it('tidak kalau data lutut belum cukup', () => {
    expect(phase2Eligible({ ...base, recentKneeScores: [1] })).toBe(false);
  });
});

describe('kneeModifier', () => {
  it('kurangi beban kalau nyeri sebelum latihan ≥ 4', () => {
    expect(kneeModifier(4, undefined).reduce).toBe(true);
  });
  it('normal kalau nyeri ringan', () => {
    expect(kneeModifier(2, { kneePost: 2, kneeNextDay: 2 }).reduce).toBe(false);
  });
  it('kurangi beban kalau nyeri bertambah keesokan harinya', () => {
    expect(kneeModifier(1, { kneePost: 1, kneeNextDay: 3 }).reduce).toBe(true);
  });
});

describe('stepUpUnlocked', () => {
  it('terbuka setelah 2 sesi C dengan nyeri ≤ 2', () => {
    expect(stepUpUnlocked([{ kneePre: 1, kneePost: 2 }, { kneePre: 0, kneePost: 1 }])).toBe(true);
  });
  it('terkunci kalau salah satu sesi > 2', () => {
    expect(stepUpUnlocked([{ kneePre: 1, kneePost: 3 }, { kneePre: 0, kneePost: 1 }])).toBe(false);
  });
  it('terkunci kalau baru 1 sesi', () => {
    expect(stepUpUnlocked([{ kneePre: 0, kneePost: 0 }])).toBe(false);
  });
});

describe('deload', () => {
  const base = {
    today: '2026-03-01',
    programStart: '2026-01-01',
    lastDeloadStart: undefined,
    stallStreaks: [0, 0, 0, 0],
    recentFeels: ['pas', 'pas', 'ringan', 'pas', 'pas', 'pas'] as const,
    kneeRising: false,
  };
  it('wajib setelah 8 minggu', () => {
    expect(shouldDeload({ ...base, recentFeels: [...base.recentFeels] }).deload).toBe(true);
  });
  it('tidak selama 2 minggu kalibrasi', () => {
    expect(shouldDeload({ ...base, recentFeels: [...base.recentFeels], today: '2026-01-10', stallStreaks: [2, 2, 2] }).deload).toBe(false);
  });
  it('lebih cepat kalau ≥50% gerakan stagnan 2 sesi', () => {
    const r = shouldDeload({ ...base, recentFeels: [...base.recentFeels], today: '2026-02-01', stallStreaks: [2, 3, 0, 0] });
    expect(r.deload).toBe(true);
  });
  it('lebih cepat kalau banyak input "berat"', () => {
    const r = shouldDeload({ ...base, today: '2026-02-01', recentFeels: ['berat', 'berat', 'berat', 'pas', 'pas', 'pas'] });
    expect(r.deload).toBe(true);
  });
  it('tidak dalam 3 minggu setelah deload sebelumnya', () => {
    const r = shouldDeload({ ...base, recentFeels: [...base.recentFeels], today: '2026-02-01', lastDeloadStart: '2026-01-20', kneeRising: true });
    expect(r.deload).toBe(false);
  });
  it('aktif selama 7 hari', () => {
    expect(isDeloadActive('2026-02-06', '2026-02-01')).toBe(true);
    expect(isDeloadActive('2026-02-08', '2026-02-01')).toBe(false);
  });
  it('volume dikurangi ~40%', () => {
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(2)).toBe(1);
  });
});

const ex = (id: string, mode: ExerciseDef['loadMode'], primary = false): ExerciseDef => ({
  id,
  name: id,
  day: 'A',
  block: 'main',
  kind: mode ? 'weighted' : 'reps',
  loadMode: mode,
  sets: 3,
  repMin: 8,
  repMax: 12,
  restSec: 60,
  primary,
  muscles: '',
  cues: [],
  mistakes: [],
  youtubeQuery: '',
});

describe('orderExercises', () => {
  it('gerakan utama tetap di depan, aksesori dikelompokkan per alat', () => {
    const list = [
      ex('floor', 'dumbbellPair', true),
      ex('pushup', undefined, true),
      ex('ohp', 'dumbbellPair', true),
      ex('lateral', 'dumbbellPair'),
      ex('curl', 'barbell'),
      ex('hammer', 'dumbbellPair'),
    ];
    expect(orderExercises(list).map((e) => e.id)).toEqual(['floor', 'pushup', 'ohp', 'lateral', 'hammer', 'curl']);
  });
  it('dumbel tunggal & sepasang tidak perlu bongkar barbel', () => {
    const list = [ex('row', 'barbell', true), ex('one', 'dumbbellSingle', true), ex('a', 'barbell'), ex('b', 'dumbbellPair')];
    expect(orderExercises(list).map((e) => e.id)).toEqual(['row', 'one', 'b', 'a']);
  });
});

describe('warmupSets', () => {
  it('2 set pemanasan ~50% dan ~75%', () => {
    const w = warmupSets(DEFAULT_EQUIPMENT, 'barbell', 30.85);
    expect(w.map((s) => s.reps)).toEqual([8, 4]);
    expect(w[0].load).toBeLessThanOrEqual(30.85 * 0.5);
    expect(w[1].load).toBeLessThanOrEqual(30.85 * 0.75);
    expect(w[1].load).toBeGreaterThan(w[0].load);
  });
  it('tidak ada pemanasan untuk beban yang sangat ringan', () => {
    expect(warmupSets(DEFAULT_EQUIPMENT, 'dumbbellPair', 2.9)).toEqual([]);
  });
});
