import 'fake-indexeddb/auto';
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

