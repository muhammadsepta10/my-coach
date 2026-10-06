import { describe, expect, it } from 'vitest';
import { loadForReps } from './e1rm';
import { type InjuryState, lockReason } from './injury';
import { DEFAULT_EQUIPMENT, achievableLoads } from './plates';
import { NORMAL_RIR, planAlternatives, planSession, siblingEstimate } from './planner';
import { EXERCISE_BY_ID, SLOTS, slotsForDay } from './program';
import { initialState } from './progression';
import {
  type BlockInfo,
  type SelectionInput,
  CORE_SLOTS,
  EARLY_ROTATION_STALL,
  blockIndexFor,
  blockStartFor,
  selectExercises,
} from './selection';
import type { ExerciseState, TrainingDay } from './types';

const eq = DEFAULT_EQUIPMENT;
function cedera(area: InjuryState['injury']['area'], status: InjuryState['injury']['status'], over: Partial<InjuryState> = {}): InjuryState {
  return { injury: { id: `${area}-kiri`, area, side: 'kiri', status, since: '2026-01-01' }, stableSessions: 0, acuteToday: false, ...over };
}
/** lutut kiri baru mulai pulih: hanya gerakan ringan untuk lutut */
const closed = [cedera('lutut', 'pemulihan')];
/** tanpa cedera: semua gerakan boleh */
const open: InjuryState[] = [];

function input(over: Partial<SelectionInput> = {}): SelectionInput {
  return {
    dayType: 'A',
    today: '2026-03-01',
    programStart: '2026-02-01', // blok 1
    states: {},
    history: { lastBySlot: {}, lastCore: [] },
    favorites: [],
    banned: [],
    injuries: closed,
    ...over,
  };
}

const ids = (s: ReturnType<typeof selectExercises>) => s.picks.map((p) => p.def.id);

function calibrated(id: string, load: number, over: Partial<ExerciseState> = {}): ExerciseState {
  return { ...initialState(EXERCISE_BY_ID[id]), calibrated: true, load, ...over };
}

describe('selectExercises — slot', () => {
  it.each(['A', 'B', 'C'] as TrainingDay[])('hari %s: tiap slot terisi tepat sekali + 2 core', (day) => {
    const sel = selectExercises(input({ dayType: day, injuries: open }));
    const slots = sel.picks.map((p) => p.slotId);
    for (const s of slotsForDay(day)) expect(slots.filter((x) => x === s.id)).toHaveLength(1);
    expect(sel.picks.filter((p) => p.def.block === 'core')).toHaveLength(2);
    expect(new Set(ids(sel)).size).toBe(sel.picks.length);
  });

  it('gerakan yang dipilih berasal dari kandidat slotnya', () => {
    const sel = selectExercises(input({ dayType: 'B' }));
    for (const p of sel.picks.filter((x) => x.def.block === 'main')) {
      expect(SLOTS.find((s) => s.id === p.slotId)!.candidates).toContain(p.def.id);
    }
  });

  it('deterministik: input sama → pilihan sama', () => {
    expect(ids(selectExercises(input()))).toEqual(ids(selectExercises(input())));
  });

  it('gerakan 🚫 tidak pernah muncul, juga di slot primer', () => {
    const banned = ['floor-press', 'lateral-raise', 'barbell-curl', 'plank'];
    for (const today of ['2026-03-01', '2026-03-02', '2026-03-03']) {
      const sel = selectExercises(input({ banned, today }));
      for (const b of banned) expect(ids(sel)).not.toContain(b);
    }
  });

  it('slot dilewati dengan catatan kalau semua kandidatnya 🚫', () => {
    const sel = selectExercises(input({ banned: ['barbell-curl', 'alternating-db-curl'] }));
    expect(sel.picks.some((p) => p.slotId === 'A5')).toBe(false);
    expect(sel.notes.join(' ')).toMatch(/Bicep 1/);
  });

  it('favorit ❤️ menang di slot aksesori', () => {
    for (const today of ['2026-03-01', '2026-03-05', '2026-03-09']) {
      const sel = selectExercises(input({ today, favorites: ['zottman-curl'] }));
      expect(sel.picks.find((p) => p.slotId === 'A6')!.def.id).toBe('zottman-curl');
    }
  });

  it('aksesori tidak mengulang gerakan sesi terakhir', () => {
    for (const last of ['hammer-curl', 'concentration-curl', 'zottman-curl']) {
      const sel = selectExercises(input({ history: { lastBySlot: { A6: last }, lastCore: [] } }));
      expect(sel.picks.find((p) => p.slotId === 'A6')!.def.id).not.toBe(last);
    }
  });

  it('aksesori boleh mengulang kalau tidak ada alternatif', () => {
    const sel = selectExercises(
      input({ dayType: 'B', banned: ['db-kickback'], history: { lastBySlot: { B5: 'overhead-tricep-ext' }, lastCore: [] } }),
    );
    expect(sel.picks.find((p) => p.slotId === 'B5')!.def.id).toBe('overhead-tricep-ext');
  });

  it('pilihan manual (Ganti gerakan) dipakai untuk slotnya', () => {
    const sel = selectExercises(input({ overrides: { A4: 'barbell-upright-row', [CORE_SLOTS.anti]: 'bear-plank' } }));
    expect(ids(sel)).toContain('barbell-upright-row');
    expect(ids(sel)).toContain('bear-plank');
  });

  it('urutan: gerakan primer dulu, core di akhir', () => {
    const sel = selectExercises(input());
    const roles = sel.picks.map((p) => (p.def.block === 'core' ? 2 : p.def.primary ? 0 : 1));
    expect([...roles].sort()).toEqual(roles);
  });
});

describe('selectExercises — blok 4 minggu', () => {
  it('blok 0 = 2 minggu kalibrasi, lalu tiap 28 hari', () => {
    expect(blockIndexFor('2026-01-01', '2026-01-14')).toBe(0);
    expect(blockIndexFor('2026-01-01', '2026-01-15')).toBe(1);
    expect(blockIndexFor('2026-01-01', '2026-02-11')).toBe(1);
    expect(blockIndexFor('2026-01-01', '2026-02-12')).toBe(2);
    expect(blockStartFor('2026-01-01', 2)).toBe('2026-02-12');
  });

  it('kalibrasi & blok pertama memakai gerakan asli (⭐)', () => {
    for (const today of ['2026-02-05', '2026-03-01']) {
      const sel = selectExercises(input({ today }));
      expect(sel.blockChanged).toBe(true);
      expect(sel.block.assignments).toMatchObject({ A1: 'floor-press', A2: 'push-up', A3: 'seated-ohp', B1: 'bent-over-row', C1: 'goblet-box-squat' });
    }
  });

  it('slot primer tetap sesuai penugasan blok yang tersimpan', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { A1: 'db-squeeze-press', A2: 'push-up', A3: 'arnold-press' } };
    const sel = selectExercises(input({ block }));
    expect(sel.blockChanged).toBe(false);
    expect(ids(sel)).toEqual(expect.arrayContaining(['db-squeeze-press', 'push-up', 'arnold-press']));
  });

  it('blok baru → slot primer berganti ke kandidat berikutnya', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { A1: 'floor-press', A3: 'seated-ohp', C1: 'goblet-box-squat' } };
    const sel = selectExercises(input({ block, today: '2026-03-20', injuries: open }));
    expect(sel.block.index).toBe(2);
    expect(sel.blockChanged).toBe(true);
    expect(sel.block.assignments.A1).toBe('barbell-floor-press');
    expect(sel.block.assignments.A3).toBe('arnold-press');
    expect(sel.block.assignments.C1).toBe('suitcase-box-squat');
  });

  it('rotasi blok melewati gerakan yang tidak boleh untuk lutut', () => {
    const block: BlockInfo = { index: 2, start: '2026-03-15', assignments: { C1: 'suitcase-box-squat' } };
    const sel = selectExercises(input({ block, programStart: '2026-01-01', today: '2026-03-20', injuries: closed }));
    expect(sel.block.index).toBe(3);
    // goblet-squat (lutut sedang) & heels-elevated (berat) dilewati
    expect(sel.block.assignments.C1).toBe('sumo-goblet-squat');
  });

  it('gerakan primer yang mandek diganti lebih cepat dan dicatat', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { A1: 'floor-press' } };
    const states = { 'floor-press': calibrated('floor-press', 9.4, { stallStreak: EARLY_ROTATION_STALL }) };
    const sel = selectExercises(input({ block, states }));
    expect(sel.picks.find((p) => p.slotId === 'A1')!.def.id).toBe('barbell-floor-press');
    expect(sel.block.assignments.A1).toBe('barbell-floor-press');
    expect(sel.blockChanged).toBe(true);
    expect(sel.rotatedAway).toEqual(['floor-press']);
    expect(sel.notes.join(' ')).toMatch(/mandek/);
  });

  it('belum mandek → tidak diganti', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { A1: 'floor-press' } };
    const states = { 'floor-press': calibrated('floor-press', 9.4, { stallStreak: EARLY_ROTATION_STALL - 1 }) };
    expect(selectExercises(input({ block, states })).rotatedAway).toEqual([]);
  });
});

describe('selectExercises — cedera', () => {
  const lututBeban = (p: { def: { load?: Record<string, string> } }) => p.def.load?.lutut;

  it('Pemulihan: hanya gerakan ringan untuk area itu', () => {
    for (const today of ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']) {
      const sel = selectExercises(input({ dayType: 'C', today, favorites: ['goblet-squat', 'reverse-lunge', 'split-squat'] }));
      for (const p of sel.picks) expect([undefined, 'ringan']).toContain(lututBeban(p));
    }
  });

  it('Pemulihan: gerakan sedang terbuka setelah nyeri stabil 2 sesi, berat tetap tidak', () => {
    const stabil = [cedera('lutut', 'pemulihan', { stableSessions: 2 })];
    const sel = selectExercises(input({ dayType: 'C', injuries: stabil, favorites: ['split-squat'] }));
    expect(sel.picks.find((p) => p.slotId === 'C4')!.def.id).toBe('split-squat');
    const berat = selectExercises(input({ dayType: 'C', injuries: stabil, favorites: ['reverse-lunge'] }));
    expect(berat.picks.some((p) => lututBeban(p) === 'berat')).toBe(false);
  });

  it('Pulih: gerakan berat boleh', () => {
    const sel = selectExercises(input({ dayType: 'C', injuries: [cedera('lutut', 'pulih')], favorites: ['reverse-lunge'] }));
    expect(ids(sel)).toContain('reverse-lunge');
  });

  it('Akut: tidak ada gerakan yang membebani area itu sama sekali', () => {
    const sel = selectExercises(input({ dayType: 'C', injuries: [cedera('lutut', 'akut')] }));
    for (const p of sel.picks) expect(lututBeban(p)).toBeUndefined();
  });

  it('nyeri ≥4 hari ini (Akut sesi) berlaku seperti Akut walau status tersimpan Pulih', () => {
    const sel = selectExercises(input({ dayType: 'C', injuries: [cedera('lutut', 'pulih', { acuteToday: true })] }));
    for (const p of sel.picks) expect(lututBeban(p)).toBeUndefined();
  });

  it('cedera di area lain ikut membatasi hari lain (pergelangan tangan Akut di hari A)', () => {
    const sel = selectExercises(input({ injuries: [cedera('pergelangan-tangan', 'akut')] }));
    for (const p of sel.picks) expect(p.def.load?.['pergelangan-tangan']).toBeUndefined();
  });

  it('beberapa cedera digabung', () => {
    const sel = selectExercises(input({ dayType: 'C', injuries: [cedera('lutut', 'akut'), cedera('punggung-bawah', 'akut')] }));
    for (const p of sel.picks) {
      expect(p.def.load?.lutut).toBeUndefined();
      expect(p.def.load?.['punggung-bawah']).toBeUndefined();
    }
  });

  it('slot tanpa kandidat aman dilewati dengan catatan yang menyebut cederanya', () => {
    const sel = selectExercises(input({ dayType: 'C', injuries: [cedera('lutut', 'akut')] }));
    expect(sel.picks.some((p) => p.slotId === 'C1')).toBe(false);
    expect(sel.notes.join(' ')).toMatch(/Squat.*lutut kiri/i);
  });

  it('rotasi blok melewati gerakan yang tidak boleh untuk cedera', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { C1: 'goblet-squat', C2: 'single-leg-rdl', C3: 'hip-thrust' } };
    const sel = selectExercises(input({ dayType: 'C', block }));
    expect(sel.picks.find((p) => p.slotId === 'C1')!.def.id).not.toBe('goblet-squat');
  });

  it('alasan kunci menyebut cedera dan syarat membukanya', () => {
    expect(lockReason(EXERCISE_BY_ID['split-squat'], closed)).toMatch(/lutut kiri.*2 sesi/i);
    expect(lockReason(EXERCISE_BY_ID['reverse-lunge'], closed)).toMatch(/lutut kiri.*Pulih/i);
    expect(lockReason(EXERCISE_BY_ID['goblet-box-squat'], [cedera('lutut', 'akut')])).toMatch(/lutut kiri.*Akut/i);
    expect(lockReason(EXERCISE_BY_ID['goblet-box-squat'], closed)).toBeUndefined();
  });
});

describe('selectExercises — core', () => {
  it('selalu 1 anti-gerakan + 1 lainnya', () => {
    for (const day of ['A', 'B', 'C'] as TrainingDay[]) {
      for (const today of ['2026-03-01', '2026-03-02', '2026-03-03']) {
        const core = selectExercises(input({ dayType: day, today })).picks.filter((p) => p.def.block === 'core');
        expect(core.map((c) => c.def.coreType).sort()).toEqual(['anti', 'other']);
      }
    }
  });

  it('tidak mengulang core sesi terakhir', () => {
    const lastCore = ['plank', 'side-plank'];
    for (const today of ['2026-03-01', '2026-03-02', '2026-03-03']) {
      const core = selectExercises(input({ today, history: { lastBySlot: {}, lastCore } })).picks.filter((p) => p.def.block === 'core');
      for (const c of core) expect(lastCore).not.toContain(c.def.id);
    }
  });

  it('carry hanya kalau dumbel sedang terpasang', () => {
    // Hari C dengan RDL barbel + glute bridge barbel di akhir → barbel terpasang
    const barbellEnd: BlockInfo = { index: 1, start: '2026-02-15', assignments: { C1: 'goblet-box-squat', C2: 'rdl', C3: 'hip-thrust' } };
    for (let d = 1; d <= 13; d++) {
      // masih blok 1 (s/d 14 Maret), jadi penugasan primer tetap
      const today = `2026-03-${String(d).padStart(2, '0')}`;
      const sel = selectExercises(
        input({ dayType: 'C', today, block: barbellEnd, banned: ['calf-raise', 'seated-calf-raise'], favorites: ['farmer-carry', 'suitcase-carry'] }),
      );
      expect(sel.picks.some((p) => p.def.carry)).toBe(false);
    }
    // Hari A: diakhiri dumbel (hammer curl dkk.) → carry favorit boleh dipilih
    const sel = selectExercises(input({ favorites: ['farmer-carry'], banned: ['barbell-upright-row'] }));
    expect(ids(sel)).toContain('farmer-carry');
  });
});

describe('beban awal dari gerakan saudara', () => {
  const rir = NORMAL_RIR;

  it('dihitung dari e1RM saudara, konservatif, dan bisa dipasang', () => {
    const states = { 'seated-ohp': calibrated('seated-ohp', 9.4, { e1rm: 13 }) };
    const est = siblingEstimate(EXERCISE_BY_ID['arnold-press'], states, eq, rir)!;
    expect(est.from.id).toBe('seated-ohp');
    const naive = loadForReps(13 * 0.85, 8, rir);
    expect(est.state.load!).toBeLessThanOrEqual(naive);
    expect(achievableLoads(eq, 'dumbbellPair').some((l) => Math.abs(l.total - est.state.load!) < 1e-6)).toBe(true);
    expect(est.state.calibrated).toBe(true);
  });

  it('mengonversi barbel total ↔ satu dumbel lewat rasio', () => {
    const states = { 'floor-press': calibrated('floor-press', 9.4, { e1rm: 14 }) };
    const est = siblingEstimate(EXERCISE_BY_ID['barbell-floor-press'], states, eq, rir)!;
    expect(est.state.load!).toBeGreaterThan(14);
  });

  it('relasi dibaca dua arah', () => {
    const states = { 'arnold-press': calibrated('arnold-press', 7.9, { e1rm: 11 }) };
    expect(siblingEstimate(EXERCISE_BY_ID['seated-ohp'], states, eq, rir)?.from.id).toBe('arnold-press');
  });

  it('tanpa data saudara → set kalibrasi seperti biasa', () => {
    expect(siblingEstimate(EXERCISE_BY_ID['arnold-press'], {}, eq, rir)).toBeUndefined();
    const plan = planSession({
      dayType: 'A',
      states: {},
      eq,
      today: '2026-03-01',
      programStart: '2026-02-01',
      deload: false,
      overrides: { A3: 'arnold-press' },
    });
    expect(plan.exercises.find((e) => e.def.id === 'arnold-press')!.sets[0].kind).toBe('calibration');
  });

  it('planner memakai perkiraan saudara: tanpa set kalibrasi, dengan catatan', () => {
    const plan = planSession({
      dayType: 'A',
      states: { 'seated-ohp': calibrated('seated-ohp', 9.4, { e1rm: 13 }) },
      eq,
      today: '2026-03-01',
      programStart: '2026-02-01',
      deload: false,
      overrides: { A3: 'arnold-press' },
    });
    const arnold = plan.exercises.find((e) => e.def.id === 'arnold-press')!;
    expect(arnold.sets.some((s) => s.kind === 'calibration')).toBe(false);
    expect(arnold.seed?.load).toBeGreaterThan(0);
    expect(arnold.notes.join(' ')).toMatch(/Seated DB Overhead Press/);
  });
});

describe('planAlternatives', () => {
  it('hanya kandidat slot yang sama, boleh untuk lutut, dan bukan 🚫', () => {
    const ctx = {
      dayType: 'C' as const,
      injuries: closed,
      states: {},
      eq,
      today: '2026-03-01',
      programStart: '2026-02-01',
      deload: false,
      banned: ['db-rdl'],
    };
    const plan = planSession(ctx);
    const squat = plan.exercises.find((e) => e.slotId === 'C1')!;
    const alts = planAlternatives(ctx, 'C1', squat.def.id, plan.exercises.map((e) => e.def)).map((a) => a.def.id);
    // lutut Pemulihan belum stabil: hanya squat yang ringan untuk lutut
    expect(alts.sort()).toEqual(['suitcase-box-squat', 'sumo-goblet-squat', 'tempo-goblet-box-squat'].filter((id) => id !== squat.def.id).sort());
    const hinge = planAlternatives(ctx, 'C2', 'rdl', plan.exercises.map((e) => e.def)).map((a) => a.def.id);
    // db-rdl 🚫, single-leg-rdl (lutut sedang) terkunci
    expect(hinge.sort()).toEqual(['b-stance-db-rdl', 'db-good-morning', 'sumo-db-deadlift']);
  });
});

describe('selectExercises — temuan review', () => {
  it('pengguna lama tanpa blok tersimpan: blok pertama tetap gerakan asli (⭐)', () => {
    const sel = selectExercises(input({ programStart: '2026-01-01', today: '2026-03-20' }));
    expect(sel.block.index).toBeGreaterThan(1);
    expect(sel.block.assignments).toMatchObject({ A1: 'floor-press', A3: 'seated-ohp', B1: 'bent-over-row', C1: 'goblet-box-squat' });
  });

  it('favorit satu-satunya yang mandek tetap dirotasi lebih cepat', () => {
    const block: BlockInfo = { index: 1, start: '2026-02-15', assignments: { A1: 'floor-press' } };
    const states = { 'floor-press': calibrated('floor-press', 9.4, { stallStreak: EARLY_ROTATION_STALL }) };
    const sel = selectExercises(input({ block, states, favorites: ['floor-press'] }));
    expect(sel.picks.find((p) => p.slotId === 'A1')!.def.id).not.toBe('floor-press');
    expect(sel.rotatedAway).toEqual(['floor-press']);
  });
});
