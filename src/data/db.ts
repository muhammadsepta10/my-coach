import Dexie, { type Table } from 'dexie';
import type { PlannedSet, LoggedSet } from '../coach/planner';
import type { EquipmentConfig } from '../coach/plates';
import type { Phase } from '../coach/rotation';
import { EXERCISE_BY_ID } from '../coach/program';
import { type BlockInfo, slotIdOf } from '../coach/selection';
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
  /** ❤️ gerakan favorit: lebih sering dipilih */
  favorites: string[];
  /** 🚫 gerakan yang tidak pernah dipilih */
  banned: string[];
  /** blok 4 minggu yang sedang berjalan */
  block?: BlockInfo;
  /** kartu "Blok baru" sudah ditutup untuk blok ini */
  blockCardSeen?: number;
  /** "Ganti gerakan" dari pratinjau Beranda, dipakai sekali saat sesi dimulai */
  pendingSwaps?: { dayType: DayType; picks: Record<string, string> };
}

export interface LoggedSetRecord extends LoggedSet {
  done: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  /** slot yang diisi gerakan ini (sesi lama: diturunkan dari definisi gerakan) */
  slotId?: string;
  /** state awal hasil perkiraan dari gerakan saudara */
  seed?: ExerciseState;
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
  /** pengurangan beban lutut aktif di sesi ini */
  kneeReduce?: boolean;
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
    // v2: bank gerakan — preferensi ❤️/🚫 dan slot di tiap gerakan sesi
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((s: Settings) => {
            s.favorites ??= [];
            s.banned ??= [];
          });
        await tx
          .table('sessions')
          .toCollection()
          .modify((s: SessionRecord) => {
            for (const e of s.exercises) {
              const def = EXERCISE_BY_ID[e.exerciseId];
              if (!e.slotId && def) e.slotId = slotIdOf(def);
            }
          });
      });
  }
}

export const db = new CoachDB();
