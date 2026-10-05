/** Minggu ringan: paling lambat tiap 8 minggu, atau lebih cepat kalau ada sinyal. */
import { daysBetween } from './dates';
import type { Feel } from './types';

export const CALIBRATION_DAYS = 14;
export const MAX_WEEKS_BETWEEN_DELOAD = 8;
export const MIN_DAYS_BETWEEN_DELOAD = 21;
export const DELOAD_DAYS = 7;
export const DELOAD_LOAD_FACTOR = 0.9;

export function shouldDeload(p: {
  today: string;
  programStart: string;
  lastDeloadStart?: string;
  /** stallStreak tiap gerakan yang sudah punya riwayat */
  stallStreaks: number[];
  recentFeels: Feel[];
  kneeRising: boolean;
}): { deload: boolean; reason?: string } {
  if (daysBetween(p.programStart, p.today) < CALIBRATION_DAYS) return { deload: false };
  const since = daysBetween(p.lastDeloadStart ?? p.programStart, p.today);
  if (since >= MAX_WEEKS_BETWEEN_DELOAD * 7) return { deload: true, reason: 'Sudah 8 minggu sejak minggu ringan terakhir' };
  if (since < MIN_DAYS_BETWEEN_DELOAD) return { deload: false };

  if (p.stallStreaks.length >= 3) {
    const stalled = p.stallStreaks.filter((s) => s >= 2).length;
    if (stalled / p.stallStreaks.length >= 0.5) return { deload: true, reason: 'Progres mandek di sebagian besar gerakan' };
  }
  if (p.recentFeels.length >= 6) {
    const heavy = p.recentFeels.filter((f) => f === 'berat').length;
    if (heavy / p.recentFeels.length >= 0.5) return { deload: true, reason: 'Banyak gerakan terasa berat belakangan ini' };
  }
  if (p.kneeRising) return { deload: true, reason: 'Nyeri lutut cenderung naik' };
  return { deload: false };
}

export function isDeloadActive(today: string, deloadStart: string | undefined): boolean {
  if (!deloadStart) return false;
  const d = daysBetween(deloadStart, today);
  return d >= 0 && d < DELOAD_DAYS;
}

export function deloadSets(sets: number): number {
  return Math.max(1, Math.round(sets * 0.6));
}
