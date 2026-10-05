import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { CoachDB } from './db';
import { createCoach, type Coach } from './coach';
import { DEFAULT_EQUIPMENT } from '../coach/plates';

let coach: Coach;
let clock = '2026-01-05';

const profile = { age: 28, heightCm: 170, weightKg: 100, experience: 'Pernah gym ±1 tahun', injuryNote: 'Lutut kiri' };

beforeEach(async () => {
  const db = new CoachDB(`test-${Math.random()}`);
  clock = '2026-01-05';
  coach = createCoach(db, () => clock);
  await coach.completeOnboarding(profile, DEFAULT_EQUIPMENT);
});

async function doSession(feel: 'pas' | 'berat' | 'ringan' = 'pas', reps?: number) {
  const s = (await coach.startSession({ kneePre: 1 }))!;
  for (let i = 0; i < s.exercises.length; i++) {
    let cur = (await coach.getSession(s.id!))!;
    const ex = cur.exercises[i];
    for (let j = 0; j < ex.planned.length; j++) {
      cur = (await coach.getSession(s.id!))!;
      const p = cur.exercises[i].planned[j];
      await coach.logSet(s.id!, i, j, { reps: reps ?? p.repMax, load: p.load });
    }
    await coach.setFeel(s.id!, i, feel);
  }
  return coach.finishSession(s.id!, { kneePost: 1 });
}

describe('coach service', () => {
  it('onboarding menyimpan profil & tanggal mulai program', async () => {
    const st = await coach.getSettings();
    expect(st?.onboarded).toBe(true);
    expect(st?.programStart).toBe('2026-01-05');
    expect(st?.phase).toBe(1);
  });

  it('hari pertama adalah A, lalu bergulir B, C, AKTIF', async () => {
    expect((await coach.nextDay()).dayType).toBe('A');
    await doSession();
    expect((await coach.nextDay()).dayType).toBe('B');
    await doSession();
    expect((await coach.nextDay()).dayType).toBe('C');
    await doSession();
    expect((await coach.nextDay()).dayType).toBe('AKTIF');
    const s = (await coach.startSession({}))!;
    await coach.finishActiveDay(s.id!, { minutes: 35, mobility: true });
    expect((await coach.nextDay()).dayType).toBe('A');
  });

  it('set kalibrasi mengisi beban set kerja berikutnya', async () => {
    const s = (await coach.startSession({}))!;
    const idx = s.exercises.findIndex((e) => e.exerciseId === 'floor-press');
    expect(s.exercises[idx].planned[1].load).toBeUndefined();
    await coach.logSet(s.id!, idx, 0, { reps: 15, load: s.exercises[idx].planned[0].load });
    const after = (await coach.getSession(s.id!))!;
    expect(after.exercises[idx].planned[1].load).toBeGreaterThan(0);
    const state = await coach.getState('floor-press');
    expect(state?.calibrated).toBe(true);
  });

  it('progresi tersimpan setelah sesi selesai', async () => {
    await doSession('pas', 15); // kalibrasi
    clock = '2026-01-09';
    // putar ke A lagi
    await doSession();
    await doSession();
    const s = (await coach.startSession({}))!;
    await coach.finishActiveDay(s.id!, { minutes: 30, mobility: false });
    const before = (await coach.getState('floor-press'))!.load!;
    await doSession('pas');
    const after = (await coach.getState('floor-press'))!.load!;
    expect(after).toBeGreaterThan(before);
  });

  it('sesi yang belum selesai bisa dilanjutkan', async () => {
    const s = (await coach.startSession({}))!;
    const again = await coach.currentSession();
    expect(again?.id).toBe(s.id);
  });

  it('berat badan tercatat dan target protein dihitung', async () => {
    await coach.addBodyWeight(99.5);
    const bw = await coach.bodyWeights();
    expect(bw[bw.length - 1].kg).toBe(99.5);
    const protein = await coach.proteinTarget();
    expect(protein).toBeGreaterThan(100);
    expect(protein).toBeLessThan(160);
  });

  it('ekspor lalu impor mengembalikan data', async () => {
    await doSession();
    const json = await coach.exportData();
    const db2 = new CoachDB(`test-${Math.random()}`);
    const coach2 = createCoach(db2, () => clock);
    await coach2.importData(json);
    expect((await coach2.history()).length).toBe(1);
    expect((await coach2.getSettings())?.onboarded).toBe(true);
  });

  it('pertanyaan lutut keesokan hari setelah latihan kaki', async () => {
    await doSession();
    await doSession();
    await doSession(); // C
    expect(await coach.pendingKneeCheck()).toBeUndefined();
    clock = '2026-01-06';
    const pending = await coach.pendingKneeCheck();
    expect(pending?.dayType).toBe('C');
    await coach.recordKneeNextDay(pending!.id!, 5);
    expect(await coach.pendingKneeCheck()).toBeUndefined();
    // sesi C berikutnya dikurangi bebannya
    const ctx = await coach.kneeStatus();
    expect(ctx.reduce).toBe(true);
  });

  it('mencatat set pada gerakan yang dilewati membatalkan status lewati', async () => {
    const s = (await coach.startSession({}))!;
    await coach.skipExercise(s.id!, 0, true);
    await coach.logSet(s.id!, 0, 0, { reps: 12, load: s.exercises[0].planned[0].load });
    expect((await coach.getSession(s.id!))!.exercises[0].skipped).toBe(false);
  });

  it('mengulang set kalibrasi memperbarui beban set berikutnya', async () => {
    const s = (await coach.startSession({}))!;
    const i = s.exercises.findIndex((e) => e.exerciseId === 'floor-press');
    const calLoad = s.exercises[i].planned[0].load;
    await coach.logSet(s.id!, i, 0, { reps: 6, load: calLoad });
    const low = (await coach.getSession(s.id!))!.exercises[i].planned[1].load!;
    await coach.unlogSet(s.id!, i, 0);
    await coach.logSet(s.id!, i, 0, { reps: 20, load: calLoad });
    const high = (await coach.getSession(s.id!))!.exercises[i].planned[1].load!;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeCloseTo((await coach.getState('floor-press'))!.load!);
  });

  it('membatalkan sesi juga membatalkan kalibrasinya', async () => {
    const s = (await coach.startSession({}))!;
    const i = s.exercises.findIndex((e) => e.exerciseId === 'floor-press');
    await coach.logSet(s.id!, i, 0, { reps: 15, load: s.exercises[i].planned[0].load });
    expect((await coach.getState('floor-press'))?.calibrated).toBe(true);
    await coach.discardSession(s.id!);
    expect(await coach.getState('floor-press')).toBeUndefined();
  });

  it('kalibrasi saat deload memakai beban 90%', async () => {
    await coach.saveSettings({ deloadStart: '2026-01-05', deloadReason: 'tes' });
    const s = (await coach.startSession({}))!;
    expect(s.deload).toBe(true);
    const i = s.exercises.findIndex((e) => e.exerciseId === 'floor-press');
    await coach.logSet(s.id!, i, 0, { reps: 25, load: s.exercises[i].planned[0].load });
    const full = (await coach.getState('floor-press'))!.load!;
    const planned = (await coach.getSession(s.id!))!.exercises[i].planned.find((p) => p.kind === 'work')!.load!;
    expect(planned).toBeLessThan(full);
  });
});


describe('bank gerakan', () => {
  it('sesi menyimpan slot tiap gerakan', async () => {
    const s = (await coach.startSession({}))!;
    expect(s.exercises.every((e) => e.slotId)).toBe(true);
    expect(s.exercises.find((e) => e.exerciseId === 'floor-press')?.slotId).toBe('A1');
  });

  it('ganti gerakan sebelum mencatat set, ditolak setelah set kerja dicatat', async () => {
    const s = (await coach.startSession({}))!;
    const i = s.exercises.findIndex((e) => e.slotId === 'A6');
    const options = await coach.swapOptions(s.id!, i);
    expect(options.length).toBeGreaterThan(0);
    const target = options[0].def.id;
    const after = await coach.swapExercise(s.id!, i, target);
    expect(after.exercises[i].exerciseId).toBe(target);
    expect(after.exercises[i].slotId).toBe('A6');
    expect(after.exercises[i].logged.every((l) => !l.done)).toBe(true);

    const p = after.exercises[i].planned[0];
    await coach.logSet(s.id!, i, 0, { reps: 12, load: p.load });
    const locked = (await coach.getSession(s.id!))!;
    expect(coach.swapLocked(locked.exercises[i])).toBe(true);
    const back = (await coach.swapOptions(s.id!, i))[0].def.id;
    await expect(coach.swapExercise(s.id!, i, back)).rejects.toThrow(/Urungkan/);
    await coach.unlogSet(s.id!, i, 0);
    await expect(coach.swapExercise(s.id!, i, back)).resolves.toBeDefined();
  });

  it('tidak bisa ganti ke gerakan dari slot lain', async () => {
    const s = (await coach.startSession({}))!;
    const i = s.exercises.findIndex((e) => e.slotId === 'A6');
    await expect(coach.swapExercise(s.id!, i, 'floor-press')).rejects.toThrow();
  });

  it('ganti dari pratinjau dipakai sekali saat sesi dimulai', async () => {
    const plan = await coach.previewPlan();
    const i = plan.exercises.findIndex((e) => e.slotId === 'A4');
    const options = await coach.previewSwapOptions(i);
    const pick = options.find((o) => o.def.id !== plan.exercises[i].def.id)!.def.id;
    await coach.previewSwap('A4', pick);
    expect((await coach.previewPlan()).exercises.find((e) => e.slotId === 'A4')!.def.id).toBe(pick);
    const s = (await coach.startSession({}))!;
    expect(s.exercises.find((e) => e.slotId === 'A4')!.exerciseId).toBe(pick);
    expect((await coach.getSettings())!.pendingSwaps).toBeUndefined();
  });

  it('❤️ dan 🚫 tersimpan dan saling meniadakan', async () => {
    await coach.toggleFavorite('zottman-curl');
    expect((await coach.getSettings())!.favorites).toEqual(['zottman-curl']);
    await coach.toggleBanned('zottman-curl');
    let st = (await coach.getSettings())!;
    expect(st.banned).toEqual(['zottman-curl']);
    expect(st.favorites).toEqual([]);
    await coach.toggleBanned('zottman-curl');
    st = (await coach.getSettings())!;
    expect(st.banned).toEqual([]);
  });

  it('gerakan 🚫 tidak muncul di rencana', async () => {
    await coach.toggleBanned('floor-press');
    const plan = await coach.previewPlan();
    expect(plan.exercises.some((e) => e.def.id === 'floor-press')).toBe(false);
    expect(plan.exercises.some((e) => e.slotId === 'A1')).toBe(true);
  });

  it('blok baru setelah kalibrasi & tiap 28 hari, tersimpan saat sesi dimulai', async () => {
    await doSession('pas', 15);
    let b = await coach.blockStatus();
    expect(b.index).toBe(0);
    expect(b.showCard).toBe(false);

    clock = '2026-01-19'; // hari ke-14 → blok 1
    b = await coach.blockStatus();
    expect(b.index).toBe(1);
    expect(b.showCard).toBe(true);
    expect(b.primaries.find((p) => p.slotId === 'A1')?.exerciseId).toBe('floor-press');
    await coach.dismissBlockCard(1);
    expect((await coach.blockStatus()).showCard).toBe(false);

    clock = '2026-02-16'; // +28 hari → blok 2, gerakan utama berganti
    b = await coach.blockStatus();
    expect(b.index).toBe(2);
    expect(b.showCard).toBe(true);
    expect(b.primaries.find((p) => p.slotId === 'B1')?.exerciseId).toBe('underhand-row');
    await doSession();
    const saved = (await coach.getSettings())!.block!;
    expect(saved.index).toBe(2);
    expect(saved.assignments.B1).toBe('underhand-row');
  });

  it('gerakan baru memakai beban dari saudara dan state-nya tersimpan setelah sesi', async () => {
    await doSession('pas', 15); // A: kalibrasi floor press dkk.
    const ohp = (await coach.getState('seated-ohp'))!;
    expect(ohp.e1rm).toBeGreaterThan(0);
    await coach.toggleBanned('seated-ohp');
    await coach.toggleBanned('standing-barbell-press');
    await doSession();
    await doSession();
    const s = (await coach.startSession({}))!;
    await coach.finishActiveDay(s.id!, { minutes: 30, mobility: false });
    const a = (await coach.startSession({}))!;
    const arnold = a.exercises.find((e) => e.exerciseId === 'arnold-press')!;
    expect(arnold.planned.some((p) => p.kind === 'calibration')).toBe(false);
    expect(arnold.seed?.load).toBeGreaterThan(0);
    await coach.discardSession(a.id!);
    await doSession();
    expect((await coach.getState('arnold-press'))?.sessions).toBe(1);
  });

  it('ekspor/impor membawa preferensi & blok', async () => {
    await coach.toggleFavorite('db-kickback');
    await coach.toggleBanned('reverse-crunch');
    await doSession();
    const json = await coach.exportData();
    const coach2 = createCoach(new CoachDB(`test-${Math.random()}`), () => clock);
    await coach2.importData(json);
    const st = (await coach2.getSettings())!;
    expect(st.favorites).toEqual(['db-kickback']);
    expect(st.banned).toEqual(['reverse-crunch']);
    expect(st.block?.index).toBe(0);
  });

  it('impor backup lama (tanpa preferensi) tetap jalan', async () => {
    const json = JSON.parse(await coach.exportData());
    for (const s of json.settings) {
      delete s.favorites;
      delete s.banned;
    }
    const coach2 = createCoach(new CoachDB(`test-${Math.random()}`), () => clock);
    await coach2.importData(JSON.stringify(json));
    expect((await coach2.getSettings())!.favorites).toEqual([]);
    await expect(coach2.previewPlan()).resolves.toBeDefined();
  });
});

describe('migrasi database v1 → v2', () => {
  it('data lama tetap ada, preferensi & slot terisi', async () => {
    const name = `test-mig-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ settings: 'id', sessions: '++id, date, dayType, status', states: 'exerciseId', bodyweights: '++id, date' });
    await v1.open();
    await v1.table('settings').put({
      id: 'settings',
      onboarded: true,
      profile,
      equipment: DEFAULT_EQUIPMENT,
      programStart: '2026-01-05',
      phase: 1,
      sound: true,
    });
    await v1.table('sessions').add({
      date: '2026-01-05',
      dayType: 'A',
      seqIndex: 0,
      phase: 1,
      status: 'done',
      deload: false,
      inCalibrationPhase: true,
      notes: [],
      exercises: [
        { exerciseId: 'floor-press', displayName: 'DB Floor Press', restSec: 120, tempo: false, kneeReduced: false, notes: [], planned: [], logged: [] },
        { exerciseId: 'plank', displayName: 'Plank', restSec: 45, tempo: false, kneeReduced: false, notes: [], planned: [], logged: [] },
      ],
      cursor: 2,
      startedAt: 1,
      finishedAt: 2,
    });
    await v1.table('states').put({ exerciseId: 'floor-press', load: 9.4, repMin: 8, repMax: 12, variant: 0, tempo: false, calibrated: true, stallStreak: 0, missStreak: 0, sessions: 1 });
    v1.close();

    const db2 = new CoachDB(name);
    const c = createCoach(db2, () => '2026-01-06');
    const st = (await c.getSettings())!;
    expect(st.favorites).toEqual([]);
    expect(st.banned).toEqual([]);
    const hist = await c.history();
    expect(hist).toHaveLength(1);
    expect(hist[0].exercises.map((e) => e.slotId)).toEqual(['A1', 'core:anti']);
    expect((await c.getState('floor-press'))?.load).toBe(9.4);
    expect((await c.nextDay()).dayType).toBe('B');
  });
});

describe('riwayat slot', () => {
  it('gerakan yang dilewati tidak dihitung sebagai "sesi terakhir"', async () => {
    const s = (await coach.startSession({}))!;
    const i = s.exercises.findIndex((e) => e.slotId === 'A6');
    const skipped = s.exercises[i].exerciseId;
    await coach.skipExercise(s.id!, i, true);
    await coach.finishSession(s.id!, {});
    await doSession();
    await doSession();
    const a = (await coach.startSession({}))!;
    await coach.finishActiveDay(a.id!, { minutes: 30, mobility: false });
    // A6 masih bisa memilih gerakan yang dilewati: ambil ❤️ supaya pasti terpilih kalau tidak dikecualikan
    await coach.toggleFavorite(skipped);
    const plan = await coach.previewPlan();
    expect(plan.exercises.find((e) => e.slotId === 'A6')!.def.id).toBe(skipped);
  });
});
