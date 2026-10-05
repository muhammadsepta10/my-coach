/**
 * Urutkan gerakan supaya bongkar-pasang barbel ↔ dumbel seminimal mungkin.
 * Gerakan utama tetap di depan sesuai urutan program.
 */
import type { ExerciseDef } from './types';

type Family = 'barbell' | 'dumbbell' | 'none';

export function family(def: ExerciseDef): Family {
  if (!def.loadMode) return 'none';
  return def.loadMode === 'barbell' ? 'barbell' : 'dumbbell';
}

export function orderExercises(defs: ExerciseDef[]): ExerciseDef[] {
  const primaries = defs.filter((d) => d.primary);
  const rest = defs.filter((d) => !d.primary);
  let current: Family = 'none';
  for (const p of primaries) if (family(p) !== 'none') current = family(p);

  const ordered = [...primaries];
  while (rest.length) {
    let i = rest.findIndex((d) => family(d) === current || family(d) === 'none');
    if (i === -1) {
      i = 0;
      current = family(rest[0]);
    }
    ordered.push(rest.splice(i, 1)[0]);
  }
  return ordered;
}
