/** Aturan lutut kiri: kurangi beban kalau nyeri, buka step-up kalau stabil. */

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

/** `cSessions`: sesi C terbaru, paling baru di akhir. */
export function stepUpUnlocked(cSessions: { kneePre?: number; kneePost?: number }[]): boolean {
  const last = cSessions.slice(-2);
  if (last.length < 2) return false;
  return last.every((s) => (s.kneePre ?? 10) <= 2 && (s.kneePost ?? 10) <= 2);
}
