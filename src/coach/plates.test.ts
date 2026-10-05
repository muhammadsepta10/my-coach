import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQUIPMENT,
  achievableLoads,
  barWeight,
  loadoutFor,
  nextLoadUp,
  roundDownToAchievable,
} from './plates';

describe('barWeight', () => {
  it('dumbel = 1 batang + 2 mur', () => {
    expect(barWeight(DEFAULT_EQUIPMENT, 'dumbbell')).toBeCloseTo(0.4);
  });
  it('barbel = 2 batang + sambungan + 2 mur', () => {
    expect(barWeight(DEFAULT_EQUIPMENT, 'barbell')).toBeCloseTo(0.85);
  });
  it('seluruh alat (pelat + batang + mur) tidak melebihi 40 kg', () => {
    const e = DEFAULT_EQUIPMENT;
    const plates = e.plates.reduce((s, p) => s + p.weight * p.count, 0);
    const hardware = 2 * e.handleWeight + e.connectorWeight + 4 * e.collarWeight;
    expect(plates + hardware).toBeLessThanOrEqual(40);
  });
});

describe('achievableLoads', () => {
  it('sepasang dumbel: tiap sisi dari 4 sisi memakai pelat yang sama', () => {
    const loads = achievableLoads(DEFAULT_EQUIPMENT, 'dumbbellPair').map((l) => l.total);
    // per sisi maksimal 1×1,25 + 1×2,5 + 2×3 = 9,75 → 0,4 + 19,5
    expect(loads[0]).toBeCloseTo(0.4);
    expect(loads[loads.length - 1]).toBeCloseTo(19.9);
    expect(loads).toContainEqual(expect.closeTo(2.9, 5));
    expect(loads).toContainEqual(expect.closeTo(6.4, 5));
  });

  it('barbel bisa memakai semua pelat (39 kg)', () => {
    const loads = achievableLoads(DEFAULT_EQUIPMENT, 'barbell').map((l) => l.total);
    expect(loads[loads.length - 1]).toBeCloseTo(39.85);
  });

  it('dumbel tunggal dibatasi jumlah pelat per sisi', () => {
    const loads = achievableLoads(DEFAULT_EQUIPMENT, 'dumbbellSingle').map((l) => l.total);
    // 4 pelat per sisi: 3+3+3+3 = 12 per sisi → 24,4
    expect(loads[loads.length - 1]).toBeCloseTo(24.4);
  });

  it('beban unik dan terurut naik', () => {
    const loads = achievableLoads(DEFAULT_EQUIPMENT, 'barbell').map((l) => l.total);
    const sorted = [...loads].sort((a, b) => a - b);
    expect(loads).toEqual(sorted);
    expect(new Set(loads.map((l) => l.toFixed(3))).size).toBe(loads.length);
  });

  it('memilih susunan dengan pelat paling sedikit', () => {
    const six = achievableLoads(DEFAULT_EQUIPMENT, 'barbell').find((l) => Math.abs(l.total - 6.85) < 1e-6);
    expect(six?.perSide).toEqual([3]);
  });
});

describe('roundDownToAchievable / nextLoadUp', () => {
  it('membulatkan ke bawah ke beban yang bisa dipasang', () => {
    expect(roundDownToAchievable(DEFAULT_EQUIPMENT, 'dumbbellPair', 7)).toBeCloseTo(6.4);
  });
  it('tidak pernah di bawah berat batang kosong', () => {
    expect(roundDownToAchievable(DEFAULT_EQUIPMENT, 'dumbbellPair', 0.1)).toBeCloseTo(0.4);
  });
  it('kenaikan berikutnya adalah kombinasi tersedia berikutnya', () => {
    expect(nextLoadUp(DEFAULT_EQUIPMENT, 'dumbbellPair', 6.4)).toBeCloseTo(7.9);
  });
  it('null kalau sudah di beban maksimal', () => {
    expect(nextLoadUp(DEFAULT_EQUIPMENT, 'dumbbellPair', 19.9)).toBeNull();
  });
});

describe('loadoutFor', () => {
  it('memberi pelat per sisi dengan pelat terberat di dalam', () => {
    const l = loadoutFor(DEFAULT_EQUIPMENT, 'dumbbellPair', 7.9);
    expect(l?.perSide).toEqual([2.5, 1.25]);
  });
  it('null untuk beban yang tidak bisa dipasang', () => {
    expect(loadoutFor(DEFAULT_EQUIPMENT, 'dumbbellPair', 7)).toBeNull();
  });
});
