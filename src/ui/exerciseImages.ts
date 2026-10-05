/**
 * Ilustrasi gerakan (dibuat dengan Canva AI): 2 frame per gerakan,
 * `-a` = posisi awal, `-b` = posisi akhir. File ada di public/exercises/.
 */
export function exerciseFrames(exerciseId: string, base: string = import.meta.env.BASE_URL): [string, string] {
  const root = base.endsWith('/') ? base : `${base}/`;
  return [`${root}exercises/${exerciseId}-a.webp`, `${root}exercises/${exerciseId}-b.webp`];
}
