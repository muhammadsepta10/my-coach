import { ANIMATIONS } from '../anim/poses';
import { ExerciseAnimation } from './ExerciseAnimation';

/** Halaman dev: semua animasi di pose awal & akhir. Buka dengan ?anim-preview */
export function AnimPreview() {
  return (
    <div className="grid grid-cols-2 gap-2 p-2 text-slate-200">
      {Object.keys(ANIMATIONS).map((id) => (
        <div key={id} className="border border-slate-800 rounded p-1">
          <p className="text-xs">{id}</p>
          <div className="grid grid-cols-2">
            <ExerciseAnimation exerciseId={id} fixedPhase={0} />
            <ExerciseAnimation exerciseId={id} fixedPhase={1} />
          </div>
        </div>
      ))}
    </div>
  );
}
