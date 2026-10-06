/** Rotasi bergulir: hari yang terlewat tidak hilang, tinggal dilanjutkan. */
import { daysBetween } from './dates';
import type { DayType } from './types';

export type Phase = 1 | 2;

export const SEQUENCES: Record<Phase, DayType[]> = {
  1: ['A', 'B', 'C', 'AKTIF'],
  2: ['A', 'B', 'C', 'A', 'B', 'C', 'AKTIF'],
};

export const PHASE1_DAYS = 42;

export interface LastDay {
  dayType: DayType;
  seqIndex: number;
  phase: Phase;
}

export function nextDay(last: LastDay | undefined, phase: Phase): { dayType: DayType; seqIndex: number } {
  const seq = SEQUENCES[phase];
  if (!last) return { dayType: seq[0], seqIndex: 0 };
  let idx = last.seqIndex;
  if (last.phase !== phase || seq[idx] !== last.dayType) {
    idx = seq.indexOf(last.dayType);
  }
  const n = (idx + 1) % seq.length;
  return { dayType: seq[n], seqIndex: n };
}

export function phase2Eligible(p: {
  phase: Phase;
  programStart: string;
  today: string;
  /** skor cek nyeri terbaru semua cedera aktif (sebelum & sesudah sesi); null = tidak ada cedera aktif */
  recentPainScores: number[] | null;
}): boolean {
  if (p.phase !== 1) return false;
  if (daysBetween(p.programStart, p.today) < PHASE1_DAYS) return false;
  if (p.recentPainScores === null) return true;
  if (p.recentPainScores.length < 4) return false;
  const avg = p.recentPainScores.reduce((a, b) => a + b, 0) / p.recentPainScores.length;
  return avg <= 2;
}
