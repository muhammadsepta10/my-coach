import type { LoadMode } from './plates';

export type DayType = 'A' | 'B' | 'C' | 'AKTIF';
export type Feel = 'berat' | 'pas' | 'ringan';

export type ExerciseKind =
  /** pakai beban barbel/dumbel, progresi lewat beban */
  | 'weighted'
  /** bodyweight, progresi lewat repetisi & variasi */
  | 'reps'
  /** tahan (detik) */
  | 'timed';

export interface ExerciseDef {
  id: string;
  name: string;
  day: Exclude<DayType, 'AKTIF'>;
  block: 'main' | 'core';
  kind: ExerciseKind;
  loadMode?: LoadMode;
  sets: number;
  /** untuk 'timed': detik awal */
  repMin: number;
  /** untuk 'timed': batas detik maksimal */
  repMax: number;
  perSide?: boolean;
  restSec: number;
  /** gerakan utama: tetap di awal sesi */
  primary?: boolean;
  lowerBody?: boolean;
  optional?: boolean;
  /** terkunci sampai lutut stabil */
  kneeGated?: boolean;
  /** beban set kalibrasi pertama (kg) */
  calibrationLoad?: number;
  /** level variasi bodyweight, dari termudah */
  variants?: string[];
  /** catatan kalau lutut sedang nyeri */
  kneeNote?: string;
  muscles: string;
  cues: string[];
  mistakes: string[];
  youtubeQuery: string;
}

export interface ExerciseState {
  exerciseId: string;
  /** beban kerja saat ini (untuk sepasang dumbel = berat satu dumbel) */
  load?: number;
  repMin: number;
  repMax: number;
  variant: number;
  tempo: boolean;
  calibrated: boolean;
  e1rm?: number;
  /** sesi berturut-turut tanpa kemajuan */
  stallStreak: number;
  /** sesi berturut-turut gagal mencapai repMin */
  missStreak: number;
  lastTotalReps?: number;
  lastAmrapDate?: string;
  sessions: number;
}

export interface SetResult {
  reps: number;
  load?: number;
}

export interface Performance {
  sets: SetResult[];
  feel: Feel;
}
