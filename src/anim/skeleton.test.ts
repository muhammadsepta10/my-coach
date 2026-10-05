import { describe, expect, it } from 'vitest';
import { dist, interpolatePose, solvePose, LIMB, type PoseSpec } from './skeleton';

const standing: PoseSpec = {
  hip: [100, 88],
  torso: 180,
  arm: { ua: 0, fa: 0 },
  leg: { target: [100, 158], bend: 'front' },
};

describe('solvePose', () => {
  it('panjang tulang tetap', () => {
    const j = solvePose(standing);
    expect(dist(j.hip, j.neck)).toBeCloseTo(LIMB.torso);
    expect(dist(j.neck, j.elbow)).toBeCloseTo(LIMB.upperArm);
    expect(dist(j.elbow, j.hand)).toBeCloseTo(LIMB.forearm);
  });

  it('IK kaki mencapai target dan lutut ke arah depan', () => {
    const squat: PoseSpec = { ...standing, hip: [80, 120], leg: { target: [100, 158], bend: 'front' } };
    const j = solvePose(squat);
    expect(j.ankle[0]).toBeCloseTo(100);
    expect(j.ankle[1]).toBeCloseTo(158);
    expect(dist(j.hip, j.knee)).toBeCloseTo(LIMB.thigh);
    expect(dist(j.knee, j.ankle)).toBeCloseTo(LIMB.shin);
    expect(j.knee[0]).toBeGreaterThan(90);
  });

  it('target terlalu jauh: tungkai lurus ke arah target', () => {
    const j = solvePose({ ...standing, leg: { target: [100, 300], bend: 'front' } });
    expect(j.knee[0]).toBeCloseTo(100);
    expect(dist(j.hip, j.ankle)).toBeCloseTo(LIMB.thigh + LIMB.shin);
  });

  it('sudut 0 = ke bawah, 90 = ke depan (kanan)', () => {
    const j = solvePose({ ...standing, arm: { ua: 90, fa: 90 } });
    expect(j.elbow[1]).toBeCloseTo(j.neck[1]);
    expect(j.elbow[0]).toBeGreaterThan(j.neck[0]);
  });
});

describe('interpolatePose', () => {
  it('setengah jalan antara dua pose', () => {
    const a: PoseSpec = { ...standing, arm: { ua: 0, fa: 0 } };
    const b: PoseSpec = { ...standing, arm: { ua: 0, fa: 160 } };
    const m = interpolatePose(a, b, 0.5);
    expect((m.arm as { fa: number }).fa).toBeCloseTo(80);
    expect((m.leg as { bend: string }).bend).toBe('front');
  });
});
