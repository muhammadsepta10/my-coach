import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ANIMATIONS, type AnimSpec, type Equip, type FrontPose, type Prop } from '../anim/poses';
import { FLOOR_Y, type Joints, type Vec, dir, interpolatePose, normalizePose, solvePose } from '../anim/skeleton';

const W = 200;
const H = 170;

/** posisi 0..1 dalam siklus → faktor interpolasi A→B→A dengan jeda di ujung */
function phase(t: number): number {
  const hold = 0.12;
  const move = 0.5 - hold;
  const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
  if (t < hold) return 0;
  if (t < 0.5) return ease((t - hold) / move);
  if (t < 0.5 + hold) return 1;
  return 1 - ease((t - 0.5 - hold) / move);
}

export function ExerciseAnimation({
  exerciseId,
  size = 'md',
  playing = true,
  fixedPhase,
}: {
  exerciseId: string;
  size?: 'sm' | 'md';
  playing?: boolean;
  /** tampilkan pose tetap (0 = awal, 1 = akhir) */
  fixedPhase?: number;
}) {
  const spec = ANIMATIONS[exerciseId];
  const [t, setT] = useState(0.3);
  const raf = useRef(0);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!spec || !playing || reduced || fixedPhase !== undefined) return;
    const period = spec.isometric ? 4000 : 2800;
    const start = performance.now();
    const loop = (now: number) => {
      setT(((now - start) % period) / period);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [spec, playing, reduced]);

  if (!spec) return null;
  const k = fixedPhase ?? phase(t);
  const cls = size === 'sm' ? 'w-24 h-20' : 'w-full max-w-xs aspect-[200/170]';

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label="Animasi contoh gerakan">
        <line x1={4} y1={FLOOR_Y} x2={W - 4} y2={FLOOR_Y} stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
        {spec.view === 'side' ? <SideFigure spec={spec} k={k} /> : <FrontFigure spec={spec} k={k} />}
      </svg>
      {spec.caption && size !== 'sm' && <figcaption className="text-xs text-slate-400 mt-1">{spec.caption}</figcaption>}
    </figure>
  );
}

const NEAR = '#38bdf8';
const FAR = '#64748b';
const BODY = '#e2e8f0';
const IRON = '#f59e0b';

function Seg({ a, b, color, w = 6 }: { a: Vec; b: Vec; color: string; w?: number }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />;
}

function SideFigure({ spec, k }: { spec: Extract<AnimSpec, { view: 'side' }>; k: number }) {
  const j: Joints = solvePose(interpolatePose(normalizePose(spec.a), normalizePose(spec.b), k));
  return (
    <g>
      {spec.props?.map((p, i) => <PropShape key={i} p={p} />)}
      {/* sisi jauh */}
      <Seg a={j.hip} b={j.farKnee} color={FAR} />
      <Seg a={j.farKnee} b={j.farAnkle} color={FAR} />
      <Seg a={j.farAnkle} b={j.farToe} color={FAR} w={4} />
      <Seg a={j.neck} b={j.farElbow} color={FAR} w={5} />
      <Seg a={j.farElbow} b={j.farHand} color={FAR} w={5} />
      {spec.equip && spec.equip.at === 'hands' && <Iron equip={spec.equip} p={j.farHand} far />}
      {/* badan */}
      <Seg a={j.hip} b={j.neck} color={BODY} w={9} />
      <circle cx={j.head[0]} cy={j.head[1]} r={9} fill={BODY} />
      {/* sisi dekat */}
      <Seg a={j.hip} b={j.knee} color={NEAR} />
      <Seg a={j.knee} b={j.ankle} color={NEAR} />
      <Seg a={j.ankle} b={j.toe} color={NEAR} w={4} />
      {spec.equip?.at === 'hip' && <Iron equip={spec.equip} p={[j.hip[0] + 2, j.hip[1] - 9]} />}
      <Seg a={j.neck} b={j.elbow} color={NEAR} w={5} />
      <Seg a={j.elbow} b={j.hand} color={NEAR} w={5} />
      {spec.equip && spec.equip.at !== 'hip' && <Iron equip={spec.equip} p={j.hand} />}
    </g>
  );
}

function Iron({ equip, p, far }: { equip: Equip; p: Vec; far?: boolean }) {
  const r = equip.type === 'barbell' ? 11 : 7;
  return (
    <g opacity={far ? 0.45 : 1}>
      <circle cx={p[0]} cy={p[1]} r={r} fill={IRON} stroke="#78350f" strokeWidth={1.5} />
      <circle cx={p[0]} cy={p[1]} r={2} fill="#78350f" />
    </g>
  );
}

function PropShape({ p }: { p: Prop }) {
  const c = '#475569';
  if (p.type === 'step') {
    return <rect x={p.x} y={FLOOR_Y - p.h} width={p.w} height={p.h} fill={c} rx={2} />;
  }
  const legH = FLOOR_Y - p.seatY;
  return (
    <g fill={c}>
      <rect x={p.x} y={p.seatY} width={p.w} height={4} rx={1} />
      <rect x={p.x + 2} y={p.seatY} width={3} height={legH} />
      <rect x={p.x + p.w - 5} y={p.seatY} width={3} height={legH} />
      {p.back === 'left' && <rect x={p.x} y={p.seatY - 40} width={3} height={40} />}
      {p.back === 'right' && <rect x={p.x + p.w - 3} y={p.seatY - 40} width={3} height={40} />}
    </g>
  );
}

function FrontFigure({ spec, k }: { spec: Extract<AnimSpec, { view: 'front' }>; k: number }) {
  const p: FrontPose = interpolatePose(spec.a, spec.b, k);
  const hipY = 90;
  const torso = 46 * (1 - 0.45 * p.lean);
  const shY = hipY - torso;
  const cx = 100;
  const headY = shY - 13 + p.lean * 6;
  const parts: ReactElement[] = [];
  for (const side of [-1, 1] as const) {
    const sh: Vec = [cx + side * 15, shY];
    const ua = dir(side * p.armOut);
    const elbow: Vec = [sh[0] + ua[0] * 25, sh[1] + ua[1] * 25];
    const fa = dir(side * (p.armOut + p.elbow));
    const hand: Vec = [elbow[0] + fa[0] * 23, elbow[1] + fa[1] * 23];
    const hip: Vec = [cx + side * 8, hipY];
    const knee: Vec = [cx + side * 11, hipY + 34];
    const ankle: Vec = [cx + side * 13, FLOOR_Y - 2];
    parts.push(
      <g key={side}>
        <Seg a={hip} b={knee} color={NEAR} />
        <Seg a={knee} b={ankle} color={NEAR} />
        <Seg a={sh} b={elbow} color={NEAR} w={5} />
        <Seg a={elbow} b={hand} color={NEAR} w={5} />
        {spec.equip && <rect x={hand[0] - 9} y={hand[1] - 3} width={18} height={6} rx={2} fill={IRON} stroke="#78350f" strokeWidth={1.2} />}
      </g>,
    );
  }
  return (
    <g>
      <path d={`M${cx - 15},${shY} L${cx + 15},${shY} L${cx + 9},${hipY} L${cx - 9},${hipY} Z`} fill={BODY} />
      <circle cx={cx} cy={headY} r={9} fill={BODY} />
      {parts}
    </g>
  );
}
