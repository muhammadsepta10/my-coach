/**
 * Kerangka figur garis tampak samping (menghadap kanan).
 * Sudut dalam derajat: 0 = ke bawah, 90 = ke depan (kanan), 180 = ke atas, -90 = ke belakang.
 * Tungkai bisa digerakkan dengan sudut (FK) atau target titik (IK dua tulang).
 */

export type Vec = [number, number];

export const LIMB = {
  torso: 46,
  neck: 3,
  headR: 9,
  upperArm: 25,
  forearm: 23,
  thigh: 36,
  shin: 34,
  foot: 10,
};

export const FLOOR_Y = 158;

export type LimbSpec = { ua: number; fa: number } | { target: Vec; bend: 'front' | 'back' | 'up' | 'down' };
export type LegSpec = { th: number; sh: number } | { target: Vec; bend: 'front' | 'back' | 'up' | 'down' };

export interface PoseSpec {
  hip: Vec;
  torso: number;
  /** sudut kepala; default sama dengan badan */
  head?: number;
  arm: LimbSpec;
  farArm?: LimbSpec;
  leg: LegSpec;
  farLeg?: LegSpec;
  /** arah telapak kaki; default tegak lurus tulang kering ke depan */
  foot?: number;
  farFoot?: number;
}

export interface Joints {
  hip: Vec;
  neck: Vec;
  head: Vec;
  elbow: Vec;
  hand: Vec;
  farElbow: Vec;
  farHand: Vec;
  knee: Vec;
  ankle: Vec;
  toe: Vec;
  farKnee: Vec;
  farAnkle: Vec;
  farToe: Vec;
}

const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (a: number): Vec => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p: Vec, v: Vec, s = 1): Vec => [p[0] + v[0] * s, p[1] + v[1] * s];
export const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleOf = (from: Vec, to: Vec) => (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;

function solveLimb(root: Vec, spec: LimbSpec | LegSpec, a: number, b: number): [Vec, Vec] {
  if ('target' in spec) {
    const d = dist(root, spec.target);
    const base = angleOf(root, spec.target);
    if (d >= a + b) {
      const j = add(root, dir(base), a);
      return [j, add(j, dir(base), b)];
    }
    // hukum cosinus: sudut antara arah ke target dan tulang pertama
    const cos = (a * a + d * d - b * b) / (2 * a * d);
    const off = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    const c1 = add(root, dir(base + off), a);
    const c2 = add(root, dir(base - off), a);
    const pick = (() => {
      switch (spec.bend) {
        case 'front':
          return c1[0] >= c2[0] ? c1 : c2;
        case 'back':
          return c1[0] < c2[0] ? c1 : c2;
        case 'up':
          return c1[1] < c2[1] ? c1 : c2;
        case 'down':
          return c1[1] >= c2[1] ? c1 : c2;
      }
    })();
    return [pick, add(pick, dir(angleOf(pick, spec.target)), b)];
  }
  const s1 = 'ua' in spec ? spec.ua : spec.th;
  const s2 = 'ua' in spec ? spec.fa : spec.sh;
  const j = add(root, dir(s1), a);
  return [j, add(j, dir(s2), b)];
}

export function solvePose(p: PoseSpec): Joints {
  const neck = add(p.hip, dir(p.torso), LIMB.torso);
  const head = add(neck, dir(p.head ?? p.torso), LIMB.neck + LIMB.headR);
  const [elbow, hand] = solveLimb(neck, p.arm, LIMB.upperArm, LIMB.forearm);
  const [farElbow, farHand] = solveLimb(neck, p.farArm ?? p.arm, LIMB.upperArm, LIMB.forearm);
  const [knee, ankle] = solveLimb(p.hip, p.leg, LIMB.thigh, LIMB.shin);
  const [farKnee, farAnkle] = solveLimb(p.hip, p.farLeg ?? p.leg, LIMB.thigh, LIMB.shin);
  const footDir = (k: Vec, an: Vec, f?: number) => f ?? angleOf(k, an) + 90;
  const toe = add(ankle, dir(footDir(knee, ankle, p.foot)), LIMB.foot);
  const farToe = add(farAnkle, dir(footDir(farKnee, farAnkle, p.farFoot ?? p.foot)), LIMB.foot);
  return { hip: p.hip, neck, head, elbow, hand, farElbow, farHand, knee, ankle, toe, farKnee, farAnkle, farToe };
}

/** Sisi jauh yang tidak didefinisikan mengikuti sisi dekat. */
export function normalizePose(p: PoseSpec): PoseSpec {
  return { ...p, farArm: p.farArm ?? p.arm, farLeg: p.farLeg ?? p.leg, farFoot: p.farFoot ?? p.foot };
}

/** Interpolasi angka secara rekursif; nilai non-angka diambil dari pose A. */
export function interpolatePose<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => interpolatePose(v, b[i], t)) as T;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const va = (a as Record<string, unknown>)[k];
      const vb = (b as Record<string, unknown>)[k];
      out[k] = va === undefined ? vb : vb === undefined ? va : interpolatePose(va, vb, t);
    }
    return out as T;
  }
  return a;
}
