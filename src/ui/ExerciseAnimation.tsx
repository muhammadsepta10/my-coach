import { useEffect, useState } from 'react';
import { exerciseFrames } from './exerciseImages';

/** lama tiap posisi ditampilkan (ms) */
const HOLD_MS = 1300;

/**
 * Ilustrasi gerakan yang berganti-ganti antara posisi awal dan akhir
 * dengan transisi halus, sehingga terlihat seperti animasi sederhana.
 */
export function ExerciseAnimation({
  exerciseId,
  size = 'md',
  playing = true,
  fixedPhase,
}: {
  exerciseId: string;
  size?: 'sm' | 'md';
  playing?: boolean;
  /** tampilkan posisi tetap (0 = awal, 1 = akhir) */
  fixedPhase?: 0 | 1;
}) {
  const [a, b] = exerciseFrames(exerciseId);
  const [showEnd, setShowEnd] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = playing && fixedPhase === undefined && !reduced;

  useEffect(() => {
    if (!animate) {
      setShowEnd(false);
      return;
    }
    const t = setInterval(() => setShowEnd((v) => !v), HOLD_MS);
    return () => clearInterval(t);
  }, [animate]);

  const end = fixedPhase !== undefined ? fixedPhase === 1 : showEnd;
  const box = size === 'sm' ? 'w-20 h-20 rounded-lg' : 'w-full max-w-72 aspect-square rounded-2xl';

  return (
    <figure className={`flex flex-col items-center ${size === 'md' ? 'w-full' : ''}`}>
      <div className={`relative overflow-hidden bg-white ${box}`} role="img" aria-label="Contoh gerakan: posisi awal dan akhir">
        <img src={a} alt="" loading="lazy" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
        <img
          src={b}
          alt=""
          loading="lazy"
          draggable={false}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out ${end ? 'opacity-100' : 'opacity-0'}`}
        />
        {size === 'md' && (
          <span className="absolute bottom-2 left-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">
            {end ? '2 · Posisi akhir' : '1 · Posisi awal'}
          </span>
        )}
      </div>
    </figure>
  );
}
