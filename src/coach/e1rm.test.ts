import { describe, expect, it } from 'vitest';
import { epley, loadForReps } from './e1rm';

describe('epley', () => {
  it('1 repetisi = beban itu sendiri', () => {
    expect(epley(20, 1)).toBe(20);
  });
  it('10 repetisi × 30 kg ≈ 40 kg', () => {
    expect(epley(30, 10)).toBeCloseTo(40);
  });
  it('0 repetisi tidak memberi estimasi', () => {
    expect(epley(30, 0)).toBe(0);
  });
});

describe('loadForReps', () => {
  it('kebalikan dari epley', () => {
    expect(loadForReps(40, 10)).toBeCloseTo(30);
  });
  it('memperhitungkan sisa repetisi (RIR)', () => {
    // 8 reps + 2 RIR = setara 10 reps
    expect(loadForReps(40, 8, 2)).toBeCloseTo(30);
  });
});
