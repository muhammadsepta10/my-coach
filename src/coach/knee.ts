/** Aturan lutut kiri: kurangi beban kalau nyeri, buka gerakan kaki bertahap kalau stabil. */
import type { Phase } from './rotation';
import type { KneeTier } from './types';

export const KNEE_PAIN_THRESHOLD = 4;
export const KNEE_LOAD_FACTOR = 0.8;

export interface KneeHistory {
  kneePost?: number;
  kneeNextDay?: number;
}

export function kneeModifier(kneePre: number | undefined, lastC: KneeHistory | undefined): { reduce: boolean; reason?: string } {
  if (kneePre !== undefined && kneePre >= KNEE_PAIN_THRESHOLD) {
    return { reduce: true, reason: `Nyeri lutut ${kneePre}/10 sebelum latihan` };
  }
  if (lastC?.kneeNextDay !== undefined) {
    if (lastC.kneeNextDay >= KNEE_PAIN_THRESHOLD) {
      return { reduce: true, reason: `Lutut ${lastC.kneeNextDay}/10 sehari setelah latihan kaki terakhir` };
    }
    if (lastC.kneePost !== undefined && lastC.kneeNextDay - lastC.kneePost >= 2) {
      return { reduce: true, reason: 'Nyeri lutut bertambah keesokan hari setelah latihan kaki terakhir' };
    }
  }
  return { reduce: false };
}

/** jumlah sesi C berturut-turut dengan nyeri ≤2 yang dibutuhkan tiap tingkat */
export const KNEE_TIER_SESSIONS = { medium: 2, high: 4 } as const;

function stableFor(cSessions: { kneePre?: number; kneePost?: number }[], n: number): boolean {
  const last = cSessions.slice(-n);
  if (last.length < n) return false;
  return last.every((s) => (s.kneePre ?? 10) <= 2 && (s.kneePost ?? 10) <= 2);
}

/** `cSessions`: sesi C terbaru, paling baru di akhir. */
export function stepUpUnlocked(cSessions: { kneePre?: number; kneePost?: number }[]): boolean {
  return stableFor(cSessions, KNEE_TIER_SESSIONS.medium);
}

export interface KneeAccess {
  /** pengurangan beban lutut sedang aktif → hanya tingkat low */
  reduce: boolean;
  mediumOpen: boolean;
  highOpen: boolean;
}

export function kneeAccess(cSessions: { kneePre?: number; kneePost?: number }[], phase: Phase, reduce: boolean): KneeAccess {
  return {
    reduce,
    mediumOpen: stableFor(cSessions, KNEE_TIER_SESSIONS.medium),
    highOpen: phase === 2 && stableFor(cSessions, KNEE_TIER_SESSIONS.high),
  };
}

export function kneeTierAllowed(tier: KneeTier | undefined, k: KneeAccess): boolean {
  if (!tier || tier === 'low') return true;
  if (k.reduce) return false;
  return tier === 'medium' ? k.mediumOpen : k.highOpen;
}

/** alasan gerakan terkunci (untuk Pustaka), undefined kalau terbuka */
export function kneeLockReason(tier: KneeTier | undefined, k: KneeAccess): string | undefined {
  if (kneeTierAllowed(tier, k)) return undefined;
  if (k.reduce) return 'Lutut sedang sensitif — sementara hanya gerakan ramah lutut';
  if (tier === 'medium') return 'Terbuka setelah nyeri lutut ≤2 di 2 sesi kaki berturut-turut';
  return 'Terbuka di Fase 2 setelah nyeri lutut ≤2 di 4 sesi kaki berturut-turut';
}
