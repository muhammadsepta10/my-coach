import Dexie, { type Table } from 'dexie';
import type { PlannedSet, LoggedSet } from '../coach/planner';
import type { EquipmentConfig } from '../coach/plates';
import type { Phase } from '../coach/rotation';
import type { DayType, ExerciseState, Feel } from '../coach/types';

export interface Profile {
  name?: string;
  age: number;
  heightCm: number;
  weightKg: number;
  experience: string;
  injuryNote: string;
}

export interface Settings {
  id: 'settings';
  onboarded: boolean;
  profile: Profile;
  equipment: EquipmentConfig;
  programStart: string;
  phase: Phase;
  /** awal minggu ringan yang sedang/terakhir berjalan */
  deloadStart?: string;
  deloadReason?: string;
  /** tawaran fase 2 sudah ditolak sampai tanggal ini */
  phase2SnoozeUntil?: string;
  sound: boolean;
}

export interface LoggedSetRecord extends LoggedSet {
  done: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  displayName: string;
  restSec: number;
  tempo: boolean;
  kneeReduced: boolean;
  notes: string[];
  planned: PlannedSet[];
  logged: LoggedSetRecord[];
  feel?: Feel;
  skipped?: boolean;
}

export interface SessionRecord {
  id?: number;
  date: string;
  dayType: DayType;
  seqIndex: number;
  phase: Phase;
  status: 'in_progress' | 'done';
  deload: boolean;
  inCalibrationPhase: boolean;
  notes: string[];
  kneePre?: number;
  kneePost?: number;
  kneeNextDay?: number;
  warmupDone?: boolean;
  exercises: SessionExercise[];
  /** posisi gerakan yang sedang dikerjakan */
  cursor: number;
  activeMinutes?: number;
  mobilityDone?: boolean;
  startedAt: number;
  finishedAt?: number;
  /** state gerakan sebelum dikalibrasi di sesi ini (null = belum ada), untuk dipulihkan kalau sesi dibatalkan */
  stateSnapshots?: Record<string, ExerciseState | null>;
}

export interface BodyWeight {
  id?: number;
  date: string;
  kg: number;
}

export class CoachDB extends Dexie {
  settings!: Table<Settings, string>;
  sessions!: Table<SessionRecord, number>;
  states!: Table<ExerciseState, string>;
  bodyweights!: Table<BodyWeight, number>;

  constructor(name = 'my-coach') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      sessions: '++id, date, dayType, status',
      states: 'exerciseId',
      bodyweights: '++id, date',
    });
  }
}

export const db = new CoachDB();
