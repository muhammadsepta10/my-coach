/** Estimasi 1RM (rumus Epley) dan kebalikannya. */

export function epley(load: number, reps: number): number {
  if (reps <= 0 || load <= 0) return 0;
  if (reps === 1) return load;
  return load * (1 + reps / 30);
}

/** Beban yang setara dengan `reps` repetisi + `rir` sisa repetisi untuk e1RM tertentu. */
export function loadForReps(e1rm: number, reps: number, rir = 0): number {
  const total = reps + rir;
  if (total <= 1) return e1rm;
  return e1rm / (1 + total / 30);
}
