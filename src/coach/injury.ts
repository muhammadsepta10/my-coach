/**
 * Cedera per area tubuh: gerakan yang boleh dipilih menyesuaikan status
 * setiap cedera aktif dan beban area tiap gerakan.
 */
import type { ExerciseDef } from './types';

export const BODY_AREAS = [
  'lutut',
  'engkel',
  'pinggul',
  'punggung-bawah',
  'bahu',
  'siku',
  'pergelangan-tangan',
  'leher',
  'tulang-kering',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const AREA_LABEL: Record<BodyArea, string> = {
  lutut: 'lutut',
  engkel: 'engkel',
  pinggul: 'pinggul',
  'punggung-bawah': 'punggung bawah',
  bahu: 'bahu',
  siku: 'siku',
  'pergelangan-tangan': 'pergelangan tangan',
  leher: 'leher',
  'tulang-kering': 'tulang kering/betis',
};

/** area yang berpasangan kiri/kanan */
export const PAIRED_AREAS: ReadonlySet<BodyArea> = new Set(['lutut', 'engkel', 'pinggul', 'bahu', 'siku', 'pergelangan-tangan', 'tulang-kering']);

export type Side = 'kiri' | 'kanan';
export type LoadLevel = 'ringan' | 'sedang' | 'berat';
export type InjuryStatus = 'akut' | 'pemulihan' | 'pulih';

export const STATUS_LABEL: Record<InjuryStatus, string> = { akut: 'Akut', pemulihan: 'Pemulihan', pulih: 'Pulih' };

/** beban gerakan per area; area yang tidak disebut = tidak dibebani */
export type AreaLoad = Partial<Record<BodyArea, LoadLevel>>;

export interface Injury {
  id: string;
  area: BodyArea;
  side?: Side;
  status: InjuryStatus;
  since: string;
  /** tanggal ditandai sembuh; selama kosong cedera masih aktif */
  healedOn?: string;
  /** saran naik ke Pulih ditunda sampai tanggal ini */
  pulihSnoozeUntil?: string;
}

/** Cedera aktif + konteks hari ini, input untuk pemilihan gerakan. */
export interface InjuryState {
  injury: Injury;
  /** sesi berturut-turut (yang membebani area ini) dengan nyeri ≤2 */
  stableSessions: number;
  /** Akut sesi: nyeri ≥4 hari ini, diperlakukan Akut khusus sesi ini */
  acuteToday: boolean;
}

/** nyeri stabil sekian sesi membuka gerakan sedang saat Pemulihan */
export const SEDANG_STABLE_SESSIONS = 2;
/** nyeri stabil sekian sesi → coach menyarankan status Pulih */
export const PULIH_STABLE_SESSIONS = 4;
export const PAIN_THRESHOLD = 4;
export const STABLE_PAIN_MAX = 2;

export function injuryName(i: Injury): string {
  return i.side && PAIRED_AREAS.has(i.area) ? `${AREA_LABEL[i.area]} ${i.side}` : AREA_LABEL[i.area];
}

function effectiveStatus(s: InjuryState): InjuryStatus {
  return s.acuteToday ? 'akut' : s.injury.status;
}

function loadAllowed(level: LoadLevel, s: InjuryState): boolean {
  const status = effectiveStatus(s);
  if (status === 'akut') return false;
  if (status === 'pulih') return true;
  if (level === 'ringan') return true;
  if (level === 'sedang') return s.stableSessions >= SEDANG_STABLE_SESSIONS;
  return false;
}

/** cedera aktif pertama yang membuat gerakan ini tidak boleh dipilih */
export function blockingInjury(def: ExerciseDef, injuries: InjuryState[]): InjuryState | undefined {
  return injuries.find((s) => {
    const level = def.load?.[s.injury.area];
    return level !== undefined && !loadAllowed(level, s);
  });
}

export function exerciseAllowed(def: ExerciseDef, injuries: InjuryState[]): boolean {
  return blockingInjury(def, injuries) === undefined;
}

/** alasan gerakan terkunci (untuk Pustaka & catatan), undefined kalau boleh */
export function lockReason(def: ExerciseDef, injuries: InjuryState[]): string | undefined {
  const s = blockingInjury(def, injuries);
  if (!s) return undefined;
  const name = injuryName(s.injury);
  if (s.acuteToday) return `${name}: nyeri tinggi hari ini — gerakan yang membebaninya dilewati dulu`;
  if (s.injury.status === 'akut') return `${name} sedang Akut — gerakan yang membebaninya tidak dipilih`;
  if (def.load?.[s.injury.area] === 'sedang') {
    return `${name}: terbuka setelah nyeri ≤2 di ${SEDANG_STABLE_SESSIONS} sesi berturut-turut`;
  }
  return `${name}: terbuka setelah status Pulih`;
}

/** skor cek nyeri satu cedera di satu sesi */
export interface PainEntry {
  pre?: number;
  post?: number;
  nextDay?: number;
}

/** sesi selesai (urut kronologis) yang membebani area cedera, beserta nyerinya */
export type PainHistory = (PainEntry | undefined)[];

function stable(p: PainEntry | undefined): boolean {
  return p !== undefined && (p.pre ?? 10) <= STABLE_PAIN_MAX && (p.post ?? 10) <= STABLE_PAIN_MAX;
}

/** sesi berturut-turut terakhir dengan nyeri ≤2 sebelum & sesudah */
export function stableSessions(history: PainHistory): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && stable(history[i]); i--) n++;
  return n;
}

/** Akut sesi: nyeri ≥4 hari ini, atau keesokan hari sesi terakhir ≥4 / naik ≥2. */
export function acuteToday(history: PainHistory, prePain: number | undefined): boolean {
  if (prePain !== undefined && prePain >= PAIN_THRESHOLD) return true;
  const last = history[history.length - 1];
  if (last?.nextDay === undefined) return false;
  if (last.nextDay >= PAIN_THRESHOLD) return true;
  return last.post !== undefined && last.nextDay - last.post >= 2;
}

/** nyeri cenderung naik di sesi terakhir yang membebani area (sinyal deload) */
export function painRising(history: PainHistory): boolean {
  const posts = history.map((p) => p?.post).filter((x): x is number => x !== undefined);
  const last = posts[posts.length - 1];
  const prev = posts[posts.length - 2];
  return last !== undefined && (last >= PAIN_THRESHOLD || (prev !== undefined && last - prev >= 2));
}

export function injuryState(injury: Injury, history: PainHistory, prePain?: number): InjuryState {
  return { injury, stableSessions: stableSessions(history), acuteToday: acuteToday(history, prePain) };
}
