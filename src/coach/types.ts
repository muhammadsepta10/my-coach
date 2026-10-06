import type { AreaLoad } from './injury';
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

export type TrainingDay = Exclude<DayType, 'AKTIF'>;

export type SlotRole = 'primary' | 'accessory' | 'optional';

/** Fungsi tetap dalam satu hari latihan (mis. "Dorong dada"), diisi salah satu kandidat. */
export interface SlotDef {
  id: string;
  label: string;
  day: TrainingDay;
  role: SlotRole;
  /** kandidat gerakan; yang pertama = gerakan default (⭐) */
  candidates: string[];
}

/**
 * Gerakan "saudara" untuk memperkirakan beban awal:
 * e1RM gerakan ini ≈ e1RM saudara × ratio (sudah termasuk beda mode alat,
 * mis. barbel total vs berat satu dumbel).
 */
export interface SiblingRef {
  id: string;
  ratio: number;
}

export interface ExerciseDef {
  id: string;
  name: string;
  /** id slot, atau 'core' untuk kolam core bersama */
  slot: string;
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
  /** gerakan utama: tetap di awal sesi (diturunkan dari peran slot) */
  primary?: boolean;
  lowerBody?: boolean;
  /** diturunkan dari peran slot */
  optional?: boolean;
  /** beban area tubuh yang dibebani gerakan ini */
  load?: AreaLoad;
  /** core: anti-gerakan (plank dkk.) atau lainnya */
  coreType?: 'anti' | 'other';
  /** core carry: hanya kalau dumbel sedang terpasang */
  carry?: boolean;
  siblings?: SiblingRef[];
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
