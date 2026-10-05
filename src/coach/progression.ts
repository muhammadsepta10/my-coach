/**
 * Double progression: naikkan repetisi dalam rentang, lalu naikkan beban
 * ke kombinasi pelat berikutnya. Kalau beban sudah mentok, geser rentang
 * repetisi lalu pakai tempo lambat.
 */
import { epley, loadForReps } from './e1rm';
import { type EquipmentConfig, nextLoadDown, nextLoadUp, roundDownToAchievable } from './plates';
import type { ExerciseDef, ExerciseState, Performance } from './types';

/** batas atas repetisi sebelum beralih ke tempo lambat */
export const REP_CEILING = 20;
/** batas atas repetisi untuk gerakan bodyweight */
export const BODYWEIGHT_REP_CEILING = 25;
/** sisa repetisi yang diminta pada set kalibrasi */
export const CALIBRATION_SET_RIR = 2;

export function initialState(def: ExerciseDef): ExerciseState {
  return {
    exerciseId: def.id,
    load: undefined,
    repMin: def.repMin,
    repMax: def.kind === 'timed' ? def.repMin : def.repMax,
    variant: 0,
    tempo: false,
    calibrated: def.kind !== 'weighted',
    stallStreak: 0,
    missStreak: 0,
    sessions: 0,
  };
}

/**
 * Set kalibrasi: dilakukan sampai sisa ~2 repetisi. Dari situ e1RM diestimasi,
 * lalu beban kerja dipilih untuk repMin dengan `targetRir` sisa repetisi.
 */
export function applyCalibration(
  def: ExerciseDef,
  state: ExerciseState,
  eq: EquipmentConfig,
  set: { load: number; reps: number },
  targetRir: number,
): ExerciseState {
  if (!def.loadMode) return state;
  const e1rm = epley(set.load, set.reps + CALIBRATION_SET_RIR);
  const load = roundDownToAchievable(eq, def.loadMode, loadForReps(e1rm, state.repMin, targetRir));
  return { ...state, calibrated: true, e1rm, load };
}

export function progress(
  def: ExerciseDef,
  state: ExerciseState,
  eq: EquipmentConfig,
  perf: Performance,
): ExerciseState {
  if (perf.sets.length === 0) return state;
  const reps = perf.sets.map((s) => s.reps);
  const totalReps = reps.reduce((a, b) => a + b, 0);
  const allTop = reps.every((r) => r >= state.repMax);
  const nearTop = reps.every((r) => r >= state.repMax - 1);
  const anyMiss = reps.some((r) => r < state.repMin);
  const readyToAdvance = (allTop && perf.feel !== 'berat') || (nearTop && perf.feel === 'ringan');

  const next: ExerciseState = { ...state, sessions: state.sessions + 1, lastTotalReps: totalReps };
  let advanced = false;

  if (def.kind === 'timed') {
    if (reps.every((r) => r >= state.repMax) && state.repMax < def.repMax) {
      next.repMax = Math.min(def.repMax, state.repMax + 5);
      advanced = true;
    }
  } else if (def.kind === 'reps') {
    if (readyToAdvance) {
      const lastVariant = (def.variants?.length ?? 1) - 1;
      if (state.variant < lastVariant) {
        next.variant = state.variant + 1;
        next.repMin = def.repMin;
        next.repMax = def.repMax;
      } else if (state.repMax < BODYWEIGHT_REP_CEILING) {
        next.repMin = state.repMin + 2;
        next.repMax = state.repMax + 2;
      } else {
        next.tempo = true;
      }
      advanced = true;
    }
  } else if (def.loadMode && state.load !== undefined) {
    const best = Math.max(...perf.sets.map((s) => epley(s.load ?? state.load!, s.reps)));
    if (best > 0) next.e1rm = best;

    if (readyToAdvance) {
      const up = nextLoadUp(eq, def.loadMode, state.load);
      if (up !== null) {
        next.load = up;
      } else if (state.repMax < REP_CEILING) {
        next.repMin = state.repMin + 2;
        next.repMax = state.repMax + 2;
      } else {
        next.tempo = true;
      }
      advanced = true;
    }
  }

  if (anyMiss && !advanced) {
    next.missStreak = state.missStreak + 1;
    if (next.missStreak >= 2 && def.kind === 'weighted' && def.loadMode && state.load !== undefined) {
      next.load = nextLoadDown(eq, def.loadMode, state.load);
      next.missStreak = 0;
    }
  } else {
    next.missStreak = 0;
  }

  const improved = advanced || (state.lastTotalReps !== undefined && totalReps > state.lastTotalReps) || state.lastTotalReps === undefined;
  next.stallStreak = improved ? 0 : state.stallStreak + 1;
  return next;
}
