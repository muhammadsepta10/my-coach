import { describe, expect, it } from 'vitest';
import type { InjuryState } from './injury';
import { DEFAULT_EQUIPMENT } from './plates';
import { planSession, finalizeExercise, setupInstruction } from './planner';
import { EXERCISE_BY_ID } from './program';
import { initialState } from './progression';
import type { ExerciseState } from './types';

const eq = DEFAULT_EQUIPMENT;

function calibrated(id: string, load: number, over: Partial<ExerciseState> = {}): ExerciseState {
  return { ...initialState(EXERCISE_BY_ID[id]), calibrated: true, load, ...over };
}

/** lutut kiri dalam Pemulihan, belum stabil: hanya gerakan ringan untuk lutut */
const lututPemulihan = (stableSessions = 0): InjuryState[] => [
  { injury: { id: 'lutut-kiri', area: 'lutut', side: 'kiri', status: 'pemulihan', since: '2026-01-01' }, stableSessions, acuteToday: false },
];

const baseCtx = {
  eq,
  injuries: lututPemulihan(),
  today: '2026-03-01',
  // blok 1 (setelah 2 minggu kalibrasi): gerakan utama masih gerakan asli
  programStart: '2026-02-01',
  deload: false,
  kneeReduce: false,
};

describe('planSession', () => {
  it('sesi pertama: set kalibrasi untuk gerakan berbeban', () => {
    const plan = planSession({ ...baseCtx, today: '2026-01-01', dayType: 'A', states: {} });
    const floor = plan.exercises.find((e) => e.def.id === 'floor-press')!;
    expect(floor.sets[0].kind).toBe('calibration');
    expect(floor.sets[0].load).toBeCloseTo(6.4);
    expect(floor.sets.filter((s) => s.kind === 'work')).toHaveLength(2);
    expect(plan.notes.join(' ')).toMatch(/kalibrasi/i);
  });

  it('memisahkan gerakan utama dan core, core di akhir', () => {
    const plan = planSession({ ...baseCtx, dayType: 'A', states: {} });
    const blocks = plan.exercises.map((e) => e.def.block);
    expect(blocks.indexOf('core')).toBeGreaterThan(blocks.lastIndexOf('main'));
  });

  it('set pemanasan hanya untuk gerakan berbeban pertama', () => {
    const plan = planSession({
      ...baseCtx,
      dayType: 'B',
      states: { 'bent-over-row': calibrated('bent-over-row', 24.85), 'one-arm-row': calibrated('one-arm-row', 12.4) },
    });
    const row = plan.exercises.find((e) => e.def.id === 'bent-over-row')!;
    const one = plan.exercises.find((e) => e.def.id === 'one-arm-row')!;
    expect(row.sets.filter((s) => s.kind === 'warmup').length).toBeGreaterThan(0);
    expect(one.sets.filter((s) => s.kind === 'warmup')).toHaveLength(0);
  });

  it('slot satu kaki (step-up dkk.) tidak muncul selama lutut belum stabil', () => {
    const plan = planSession({ ...baseCtx, dayType: 'C', states: {} });
    expect(plan.exercises.some((e) => e.slotId === 'C4')).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/terkunci/);
    const open = planSession({ ...baseCtx, dayType: 'C', states: {}, injuries: lututPemulihan(2) });
    const c4 = open.exercises.find((e) => e.slotId === 'C4')!;
    // stabil 2 sesi: gerakan lutut sedang terbuka, yang berat belum
    expect(c4.def.load?.lutut).toBe('sedang');
  });

  it('deload: set dikurangi dan beban 90%', () => {
    const states = { 'floor-press': calibrated('floor-press', 11.4) };
    const plan = planSession({ ...baseCtx, dayType: 'A', states, deload: true });
    const floor = plan.exercises.find((e) => e.def.id === 'floor-press')!;
    const work = floor.sets.filter((s) => s.kind === 'work');
    expect(work).toHaveLength(2);
    expect(work[0].load).toBeCloseTo(8.9);
  });

  it('AMRAP tiap 4 minggu di set terakhir gerakan utama', () => {
    const states = { 'floor-press': calibrated('floor-press', 11.4, { lastAmrapDate: '2026-01-20' }) };
    const plan = planSession({ ...baseCtx, dayType: 'A', states });
    const floor = plan.exercises.find((e) => e.def.id === 'floor-press')!;
    expect(floor.sets[floor.sets.length - 1].kind).toBe('amrap');
    const recent = planSession({
      ...baseCtx,
      dayType: 'A',
      states: { 'floor-press': calibrated('floor-press', 11.4, { lastAmrapDate: '2026-02-20' }) },
    });
    const f2 = recent.exercises.find((e) => e.def.id === 'floor-press')!;
    expect(f2.sets.some((s) => s.kind === 'amrap')).toBe(false);
  });

  it('bodyweight memakai nama variasi saat ini', () => {
    const plan = planSession({ ...baseCtx, dayType: 'A', states: { 'push-up': { ...initialState(EXERCISE_BY_ID['push-up']), variant: 1 } } });
    expect(plan.exercises.find((e) => e.def.id === 'push-up')!.displayName).toBe('Push-up di lantai');
  });

  it('hari aktif tidak punya gerakan', () => {
    expect(planSession({ ...baseCtx, dayType: 'AKTIF', states: {} }).exercises).toEqual([]);
  });
});

describe('setupInstruction', () => {
  it('memberi tahu kapan merakit barbel', () => {
    expect(setupInstruction(eq, 'dumbbell', 'barbell', 6.85)).toMatch(/Rakit barbel/);
    expect(setupInstruction(eq, 'dumbbell', 'barbell', 6.85)).toMatch(/3/);
  });
  it('memberi tahu kapan membongkar jadi dumbel', () => {
    expect(setupInstruction(eq, 'barbell', 'dumbbellPair', 7.9)).toMatch(/Bongkar/);
  });
});

describe('finalizeExercise', () => {
  it('memproses hasil set kerja menjadi state baru', () => {
    const def = EXERCISE_BY_ID['floor-press'];
    const s = finalizeExercise(def, calibrated('floor-press', 6.4), eq, {
      sets: [
        { kind: 'warmup', reps: 8, load: 2.9 },
        { kind: 'work', reps: 12, load: 6.4 },
        { kind: 'work', reps: 12, load: 6.4 },
        { kind: 'work', reps: 12, load: 6.4 },
      ],
      feel: 'pas',
      deload: false,
      kneeReduced: false,
      today: '2026-03-01',
    });
    expect(s.load).toBeCloseTo(7.9);
  });

  it('tidak menaikkan beban saat deload', () => {
    const def = EXERCISE_BY_ID['floor-press'];
    const s = finalizeExercise(def, calibrated('floor-press', 6.4), eq, {
      sets: [{ kind: 'work', reps: 12, load: 5.4 }],
      feel: 'ringan',
      deload: true,
      kneeReduced: false,
      today: '2026-03-01',
    });
    expect(s.load).toBeCloseTo(6.4);
  });

  it('mencatat tanggal AMRAP', () => {
    const def = EXERCISE_BY_ID['floor-press'];
    const s = finalizeExercise(def, calibrated('floor-press', 6.4), eq, {
      sets: [
        { kind: 'work', reps: 10, load: 6.4 },
        { kind: 'amrap', reps: 16, load: 6.4 },
      ],
      feel: 'pas',
      deload: false,
      kneeReduced: false,
      today: '2026-03-01',
    });
    expect(s.lastAmrapDate).toBe('2026-03-01');
    expect(s.e1rm).toBeCloseTo(6.4 * (1 + 16 / 30));
  });
});
