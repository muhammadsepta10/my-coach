/** Set pemanasan otomatis untuk gerakan berbeban pertama. */
import { type EquipmentConfig, type LoadMode, achievableLoads, roundDownToAchievable } from './plates';

export interface WarmupSet {
  reps: number;
  load: number;
}

export function warmupSets(eq: EquipmentConfig, mode: LoadMode, workLoad: number): WarmupSet[] {
  const lightest = achievableLoads(eq, mode)[0].total;
  const out: WarmupSet[] = [];
  for (const [pct, reps] of [
    [0.5, 8],
    [0.75, 4],
  ] as const) {
    const load = roundDownToAchievable(eq, mode, workLoad * pct);
    if (load >= workLoad - 1e-6) continue;
    if (out.some((s) => Math.abs(s.load - load) < 1e-6)) continue;
    if (load <= lightest + 1e-6 && workLoad < 5) continue;
    out.push({ reps, load });
  }
  return out;
}
