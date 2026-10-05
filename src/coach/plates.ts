/**
 * Kalkulator pelat: beban apa saja yang benar-benar bisa dipasang
 * dengan satu set barbel/dumbel yang dimiliki.
 */

export type LoadMode = 'barbell' | 'dumbbellPair' | 'dumbbellSingle';

export interface PlateType {
  weight: number;
  count: number;
}

export interface EquipmentConfig {
  plates: PlateType[];
  /** berat satu batang dumbel */
  handleWeight: number;
  /** berat satu mur pengunci */
  collarWeight: number;
  /** berat batang sambungan */
  connectorWeight: number;
  /** pelat maksimal per sisi pada batang dumbel */
  maxPlatesPerSideDumbbell: number;
  /** pelat maksimal per sisi saat dirakit jadi barbel */
  maxPlatesPerSideBarbell: number;
}

export const DEFAULT_EQUIPMENT: EquipmentConfig = {
  plates: [
    { weight: 1.25, count: 4 },
    { weight: 2.5, count: 4 },
    { weight: 3, count: 8 },
  ],
  handleWeight: 0.25,
  collarWeight: 0.075,
  connectorWeight: 0.2,
  maxPlatesPerSideDumbbell: 4,
  maxPlatesPerSideBarbell: 8,
};

export interface Loadout {
  /** total beban; untuk sepasang dumbel = berat SATU dumbel */
  total: number;
  /** pelat di satu sisi, terberat dulu (paling dalam) */
  perSide: number[];
}

const EPS = 1e-6;

export function barWeight(e: EquipmentConfig, mode: 'barbell' | 'dumbbell'): number {
  if (mode === 'barbell') return 2 * e.handleWeight + e.connectorWeight + 2 * e.collarWeight;
  return e.handleWeight + 2 * e.collarWeight;
}

function sidesUsingPlates(mode: LoadMode): number {
  // jumlah sisi yang harus diisi pelat identik
  return mode === 'dumbbellPair' ? 4 : 2;
}

const cache = new WeakMap<EquipmentConfig, Map<LoadMode, Loadout[]>>();

export function achievableLoads(e: EquipmentConfig, mode: LoadMode): Loadout[] {
  let byMode = cache.get(e);
  if (!byMode) {
    byMode = new Map();
    cache.set(e, byMode);
  }
  const hit = byMode.get(mode);
  if (hit) return hit;

  const sides = sidesUsingPlates(mode);
  const maxPerSide = mode === 'barbell' ? e.maxPlatesPerSideBarbell : e.maxPlatesPerSideDumbbell;
  const bar = barWeight(e, mode === 'barbell' ? 'barbell' : 'dumbbell');
  const types = [...e.plates].sort((a, b) => b.weight - a.weight);

  const best = new Map<string, Loadout>();
  const walk = (i: number, side: number[]) => {
    if (i === types.length) {
      const sideSum = side.reduce((s, w) => s + w, 0);
      const total = round3(bar + 2 * sideSum);
      const key = total.toFixed(3);
      const prev = best.get(key);
      if (!prev || side.length < prev.perSide.length) best.set(key, { total, perSide: [...side] });
      return;
    }
    const t = types[i];
    const maxOfType = Math.floor(t.count / sides);
    for (let n = 0; n <= maxOfType && side.length + n <= maxPerSide; n++) {
      walk(i + 1, side.concat(Array(n).fill(t.weight)));
    }
  };
  walk(0, []);

  const result = [...best.values()].sort((a, b) => a.total - b.total);
  byMode.set(mode, result);
  return result;
}

export function loadoutFor(e: EquipmentConfig, mode: LoadMode, total: number): Loadout | null {
  return achievableLoads(e, mode).find((l) => Math.abs(l.total - total) < 1e-3) ?? null;
}

export function roundDownToAchievable(e: EquipmentConfig, mode: LoadMode, target: number): number {
  const loads = achievableLoads(e, mode);
  let pick = loads[0].total;
  for (const l of loads) if (l.total <= target + EPS) pick = l.total;
  return pick;
}

export function nextLoadUp(e: EquipmentConfig, mode: LoadMode, current: number): number | null {
  const next = achievableLoads(e, mode).find((l) => l.total > current + 1e-3);
  return next ? next.total : null;
}

export function nextLoadDown(e: EquipmentConfig, mode: LoadMode, current: number): number {
  const loads = achievableLoads(e, mode);
  let pick = loads[0].total;
  for (const l of loads) if (l.total < current - 1e-3) pick = l.total;
  return pick;
}

export function maxLoad(e: EquipmentConfig, mode: LoadMode): number {
  const loads = achievableLoads(e, mode);
  return loads[loads.length - 1].total;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatKg(n: number): string {
  return `${Number(n.toFixed(2)).toLocaleString('id-ID')} kg`;
}

export function formatLoad(mode: LoadMode, total: number): string {
  return mode === 'dumbbellPair' ? `2 × ${formatKg(total)}` : formatKg(total);
}

export function describeLoadout(mode: LoadMode, l: Loadout): string {
  const side = l.perSide.length ? l.perSide.map((w) => w.toLocaleString('id-ID')).join(' + ') : 'tanpa pelat';
  if (mode === 'barbell') return `Barbel — tiap sisi: ${side}`;
  if (mode === 'dumbbellPair') return `2 dumbel — tiap sisi: ${side}`;
  return `1 dumbel — tiap sisi: ${side}`;
}
