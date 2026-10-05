import { EXERCISES } from '../coach/program';
import { ExerciseAnimation } from './ExerciseAnimation';

/** Halaman dev: semua ilustrasi di posisi awal & akhir. Buka dengan ?anim-preview */
export function AnimPreview() {
  return (
    <div className="grid grid-cols-2 gap-2 p-2 text-slate-200">
      {EXERCISES.map((e) => (
        <div key={e.id} className="border border-slate-800 rounded p-1">
          <p className="text-xs">{e.id}</p>
          <div className="grid grid-cols-2 gap-1">
            <ExerciseAnimation exerciseId={e.id} fixedPhase={0} />
            <ExerciseAnimation exerciseId={e.id} fixedPhase={1} />
          </div>
        </div>
      ))}
    </div>
  );
}
