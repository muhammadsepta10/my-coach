/**
 * Menyusun "Latihan Hari Ini" dari program + state tiap gerakan + aturan
 * kalibrasi, lutut, deload, AMRAP, pemanasan dan urutan alat.
 */
import { daysBetween } from './dates';
import { CALIBRATION_DAYS, DELOAD_LOAD_FACTOR, deloadSets } from './deload';
import { KNEE_LOAD_FACTOR } from './knee';
import { family, orderExercises } from './ordering';
import {
  type EquipmentConfig,
  type LoadMode,
  describeLoadout,
  loadoutFor,
  roundDownToAchievable,
} from './plates';
import { exercisesForDay } from './program';
import { initialState, progress } from './progression';
import type { DayType, ExerciseDef, ExerciseState, Feel } from './types';
import { warmupSets } from './warmup';

export const AMRAP_INTERVAL_DAYS = 28;
/** sisa repetisi yang diminta selama 2 minggu kalibrasi */
export const CALIBRATION_PHASE_RIR = 3;
export const NORMAL_RIR = 2;

export type SetKind = 'warmup' | 'calibration' | 'work' | 'amrap';

export interface PlannedSet {
  kind: SetKind;
  /** target repetisi bawah (atau detik untuk timed) */
  repMin: number;
  repMax: number;
  /** undefined = belum diketahui (menunggu set kalibrasi) atau tanpa beban */
  load?: number;
}

export interface PlannedExercise {
  def: ExerciseDef;
  displayName: string;
  sets: PlannedSet[];
  restSec: number;
  tempo: boolean;
  kneeReduced: boolean;
  notes: string[];
}

export interface PlannedSession {
  dayType: DayType;
  inCalibrationPhase: boolean;
  deload: boolean;
  notes: string[];
  exercises: PlannedExercise[];
}

export interface PlanContext {
  dayType: DayType;
  states: Record<string, ExerciseState>;
  eq: EquipmentConfig;
  today: string;
  programStart: string;
  deload: boolean;
  kneeReduce: boolean;
  stepUpOpen: boolean;
}

export function inCalibrationPhase(programStart: string, today: string): boolean {
  return daysBetween(programStart, today) < CALIBRATION_DAYS;
}

export function targetRir(programStart: string, today: string): number {
  return inCalibrationPhase(programStart, today) ? CALIBRATION_PHASE_RIR : NORMAL_RIR;
}

export function planSession(ctx: PlanContext): PlannedSession {
  const calib = inCalibrationPhase(ctx.programStart, ctx.today);
  const notes: string[] = [];
  if (calib) notes.push('Minggu kalibrasi: sisakan 3–4 repetisi di setiap set. Fokus teknik, bukan beban.');
  if (ctx.deload) notes.push('Minggu ringan (deload): set dikurangi & beban 90%. Pulihkan badan.');
  if (ctx.kneeReduce && ctx.dayType === 'C') notes.push('Lutut sedang sensitif: beban gerakan kaki dikurangi 20%.');

  if (ctx.dayType === 'AKTIF') {
    return { dayType: 'AKTIF', inCalibrationPhase: calib, deload: ctx.deload, notes, exercises: [] };
  }

  const all = exercisesForDay(ctx.dayType);
  const main = orderExercises(all.filter((d) => d.block === 'main' && (!d.kneeGated || ctx.stepUpOpen)));
  const core = all.filter((d) => d.block === 'core');
  if (ctx.dayType === 'C' && !ctx.stepUpOpen) {
    notes.push('Step-up masih terkunci sampai lutut stabil (nyeri ≤2 di 2 sesi kaki berturut-turut).');
  }

  let warmupGiven = false;
  const exercises = [...main, ...core].map((def): PlannedExercise => {
    const state = ctx.states[def.id] ?? initialState(def);
    const p = planExercise(def, state, ctx, calib, !warmupGiven);
    if (p.sets.some((s) => s.kind === 'warmup' || s.kind === 'calibration')) warmupGiven = true;
    if (def.kind === 'weighted' && state.calibrated && state.load !== undefined) warmupGiven = true;
    return p;
  });

  return { dayType: ctx.dayType, inCalibrationPhase: calib, deload: ctx.deload, notes, exercises };
}

function planExercise(
  def: ExerciseDef,
  state: ExerciseState,
  ctx: PlanContext,
  calib: boolean,
  giveWarmup: boolean,
): PlannedExercise {
  const notes: string[] = [];
  const setCount = ctx.deload ? deloadSets(def.sets) : def.sets;
  const displayName = def.variants ? def.variants[Math.min(state.variant, def.variants.length - 1)] : def.name;
  const kneeReduced = ctx.kneeReduce && !!def.lowerBody;
  if (kneeReduced && def.kneeNote) notes.push(def.kneeNote);
  if (state.tempo) notes.push('Tempo lambat: turun 3 detik, jeda 1 detik di bawah, naik normal.');
  if (def.optional) notes.push('Opsional — lakukan kalau waktu masih cukup.');

  const sets: PlannedSet[] = [];
  const work = (load?: number): PlannedSet => ({ kind: 'work', repMin: state.repMin, repMax: state.repMax, load });

  if (def.kind === 'weighted' && def.loadMode) {
    const mode = def.loadMode;
    if (!state.calibrated || state.load === undefined) {
      const load = roundDownToAchievable(ctx.eq, mode, def.calibrationLoad ?? 0);
      sets.push({ kind: 'calibration', repMin: state.repMin, repMax: 30, load });
      for (let i = 1; i < setCount; i++) sets.push(work(undefined));
      notes.push('Set kalibrasi: lakukan sampai terasa masih sanggup ±2 repetisi lagi. Beban set berikutnya dihitung otomatis.');
    } else {
      // dibulatkan ulang kalau alat di Pengaturan berubah
      let load = roundDownToAchievable(ctx.eq, mode, state.load);
      if (ctx.deload) load = roundDownToAchievable(ctx.eq, mode, load * DELOAD_LOAD_FACTOR);
      if (kneeReduced) load = roundDownToAchievable(ctx.eq, mode, load * KNEE_LOAD_FACTOR);
      if (giveWarmup) for (const w of warmupSets(ctx.eq, mode, load)) sets.push({ kind: 'warmup', repMin: w.reps, repMax: w.reps, load: w.load });
      for (let i = 0; i < setCount; i++) sets.push(work(load));
      if (def.primary && !calib && !ctx.deload && !kneeReduced && amrapDue(state, ctx)) {
        sets[sets.length - 1] = { ...sets[sets.length - 1], kind: 'amrap', repMax: 50 };
        notes.push('Tes AMRAP di set terakhir: lakukan repetisi sebanyak mungkin dengan teknik baik, sisakan 1.');
      }
    }
  } else {
    for (let i = 0; i < setCount; i++) sets.push(work(undefined));
  }

  return { def, displayName, sets, restSec: def.restSec, tempo: state.tempo, kneeReduced, notes };
}

function amrapDue(state: ExerciseState, ctx: PlanContext): boolean {
  const since = state.lastAmrapDate ?? ctx.programStart;
  return daysBetween(since, ctx.today) >= AMRAP_INTERVAL_DAYS;
}

export function setupInstruction(
  eq: EquipmentConfig,
  prevFamily: 'barbell' | 'dumbbell' | 'none',
  mode: LoadMode,
  load: number,
): string {
  const lo = loadoutFor(eq, mode, load);
  const plates = lo ? describeLoadout(mode, lo) : '';
  const fam = mode === 'barbell' ? 'barbell' : 'dumbbell';
  let prefix = '';
  if (fam === 'barbell' && prevFamily !== 'barbell') prefix = 'Rakit barbel: sambungkan 2 batang dengan batang sambungan. ';
  if (fam === 'dumbbell' && prevFamily === 'barbell') prefix = 'Bongkar barbel jadi dumbel: lepas batang sambungan. ';
  return prefix + plates;
}

export { family };

export interface LoggedSet {
  kind: SetKind;
  reps: number;
  load?: number;
}

export function finalizeExercise(
  def: ExerciseDef,
  state: ExerciseState,
  eq: EquipmentConfig,
  r: { sets: LoggedSet[]; feel: Feel; deload: boolean; kneeReduced: boolean; today: string },
): ExerciseState {
  const workSets = r.sets.filter((s) => s.kind === 'work' || s.kind === 'amrap');
  if (workSets.length === 0) return state;
  const hadAmrap = workSets.some((s) => s.kind === 'amrap');
  const progressed = progress(def, state, eq, { sets: workSets, feel: r.feel });
  const next: ExerciseState = { ...progressed };
  if (r.deload || r.kneeReduced) {
    // Beban sengaja diturunkan: jangan ubah beban/rentang, cukup catat sesi & e1RM.
    next.load = state.load;
    next.repMin = state.repMin;
    next.repMax = state.repMax;
    next.variant = state.variant;
    next.tempo = state.tempo;
    next.stallStreak = state.stallStreak;
    next.missStreak = state.missStreak;
    next.lastTotalReps = state.lastTotalReps;
    if (progressed.e1rm !== undefined && def.kind === 'weighted') next.e1rm = Math.max(progressed.e1rm, state.e1rm ?? 0);
  }
  if (hadAmrap) next.lastAmrapDate = r.today;
  return next;
}
