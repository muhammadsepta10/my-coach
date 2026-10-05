/**
 * Service "coach": menghubungkan logika coach (murni) dengan penyimpanan IndexedDB.
 */
import { daysBetween } from '../coach/dates';
import { DELOAD_LOAD_FACTOR, isDeloadActive, shouldDeload } from '../coach/deload';
import { kneeModifier, stepUpUnlocked } from '../coach/knee';
import { type EquipmentConfig, roundDownToAchievable } from '../coach/plates';
import { finalizeExercise, planSession, targetRir } from '../coach/planner';
import { EXERCISE_BY_ID } from '../coach/program';
import { applyCalibration, initialState } from '../coach/progression';
import { KNEE_LOAD_FACTOR } from '../coach/knee';
import { nextDay as rotationNext, phase2Eligible } from '../coach/rotation';
import type { DayType, ExerciseState, Feel } from '../coach/types';
import type { BodyWeight, CoachDB, Profile, SessionExercise, SessionRecord, Settings } from './db';

export type Coach = ReturnType<typeof createCoach>;

export function createCoach(db: CoachDB, now: () => string) {
  async function getSettings(): Promise<Settings | undefined> {
    return db.settings.get('settings');
  }

  async function requireSettings(): Promise<Settings> {
    const s = await getSettings();
    if (!s) throw new Error('Belum onboarding');
    return s;
  }

  async function saveSettings(patch: Partial<Settings>) {
    const cur = await requireSettings();
    await db.settings.put({ ...cur, ...patch });
  }

  async function completeOnboarding(profile: Profile, equipment: EquipmentConfig) {
    const today = now();
    await db.settings.put({
      id: 'settings',
      onboarded: true,
      profile,
      equipment,
      programStart: today,
      phase: 1,
      sound: true,
    });
    await db.bodyweights.add({ date: today, kg: profile.weightKg });
  }

  async function doneSessions(): Promise<SessionRecord[]> {
    const all = await db.sessions.where('status').equals('done').toArray();
    return all.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  }

  async function nextDay() {
    const s = await requireSettings();
    const done = await doneSessions();
    const last = done[done.length - 1];
    return rotationNext(last ? { dayType: last.dayType, seqIndex: last.seqIndex, phase: last.phase } : undefined, s.phase);
  }

  async function currentSession(): Promise<SessionRecord | undefined> {
    return db.sessions.where('status').equals('in_progress').first();
  }

  async function getSession(id: number) {
    return db.sessions.get(id);
  }

  async function getStates(): Promise<Record<string, ExerciseState>> {
    const list = await db.states.toArray();
    return Object.fromEntries(list.map((s) => [s.exerciseId, s]));
  }

  async function getState(id: string) {
    return db.states.get(id);
  }

  async function lastCSessions(): Promise<SessionRecord[]> {
    return (await doneSessions()).filter((s) => s.dayType === 'C');
  }

  async function kneeStatus(kneePre?: number) {
    const cs = await lastCSessions();
    const lastC = cs[cs.length - 1];
    return kneeModifier(kneePre, lastC ? { kneePost: lastC.kneePost, kneeNextDay: lastC.kneeNextDay } : undefined);
  }

  async function deloadStatus(): Promise<{ active: boolean; reason?: string; start?: string }> {
    const s = await requireSettings();
    const today = now();
    if (isDeloadActive(today, s.deloadStart)) return { active: true, reason: s.deloadReason, start: s.deloadStart };
    const states = Object.values(await getStates()).filter((st) => st.sessions >= 2);
    const done = await doneSessions();
    const feels = done
      .flatMap((d) => d.exercises.filter((e) => !e.skipped && e.feel).map((e) => e.feel as Feel))
      .slice(-12);
    const cs = done.filter((d) => d.dayType === 'C' && d.kneePost !== undefined);
    const lastPost = cs[cs.length - 1]?.kneePost;
    const prevPost = cs[cs.length - 2]?.kneePost;
    const kneeRising = lastPost !== undefined && (lastPost >= 4 || (prevPost !== undefined && lastPost - prevPost >= 2));
    const r = shouldDeload({
      today,
      programStart: s.programStart,
      lastDeloadStart: s.deloadStart,
      stallStreaks: states.map((st) => st.stallStreak),
      recentFeels: feels,
      kneeRising,
    });
    return { active: false, reason: r.deload ? r.reason : undefined };
  }

  /** Rencana hari berikutnya tanpa menyimpan apa pun (untuk Beranda). */
  async function previewPlan() {
    const settings = await requireSettings();
    const today = now();
    const { dayType } = await nextDay();
    const d = dayType === 'AKTIF' ? { active: false } : await deloadStatus();
    const deload = d.active || ('reason' in d && !!d.reason);
    const knee = dayType === 'C' ? await kneeStatus(undefined) : { reduce: false };
    const deloadReason = d.active ? settings.deloadReason : 'reason' in d ? d.reason : undefined;
    const plan = planSession({
      dayType,
      states: await getStates(),
      eq: settings.equipment,
      today,
      programStart: settings.programStart,
      deload,
      kneeReduce: knee.reduce,
      stepUpOpen: stepUpUnlocked(await lastCSessions()),
    });
    return { ...plan, deloadReason };
  }

  async function startSession(opts: { kneePre?: number }): Promise<SessionRecord | undefined> {
    const existing = await currentSession();
    if (existing) return existing;
    const settings = await requireSettings();
    const today = now();
    const { dayType, seqIndex } = await nextDay();

    let deload = false;
    if (dayType !== 'AKTIF') {
      const d = await deloadStatus();
      if (d.active) deload = true;
      else if (d.reason) {
        deload = true;
        await saveSettings({ deloadStart: today, deloadReason: d.reason });
      }
    }
    const knee = dayType === 'C' ? await kneeStatus(opts.kneePre) : { reduce: false };
    const cs = await lastCSessions();
    const plan = planSession({
      dayType,
      states: await getStates(),
      eq: settings.equipment,
      today,
      programStart: settings.programStart,
      deload,
      kneeReduce: knee.reduce,
      stepUpOpen: stepUpUnlocked(cs),
    });
    const notes = [...plan.notes];
    if (knee.reduce && 'reason' in knee && knee.reason) notes.unshift(knee.reason);
    if (deload) {
      const s = await requireSettings();
      if (s.deloadReason) notes.unshift(`Minggu ringan: ${s.deloadReason}.`);
    }

    const exercises: SessionExercise[] = plan.exercises.map((p) => ({
      exerciseId: p.def.id,
      displayName: p.displayName,
      restSec: p.restSec,
      tempo: p.tempo,
      kneeReduced: p.kneeReduced,
      notes: p.notes,
      planned: p.sets,
      logged: p.sets.map((ps) => ({ kind: ps.kind, reps: 0, load: ps.load, done: false })),
    }));

    const rec: SessionRecord = {
      date: today,
      dayType,
      seqIndex,
      phase: settings.phase,
      status: 'in_progress',
      deload,
      inCalibrationPhase: plan.inCalibrationPhase,
      notes,
      kneePre: opts.kneePre,
      exercises,
      cursor: 0,
      startedAt: Date.now(),
    };
    rec.id = await db.sessions.add(rec);
    return rec;
  }

  async function patchSession(id: number, fn: (s: SessionRecord) => void): Promise<SessionRecord> {
    return db.transaction('rw', db.sessions, async () => {
      const s = await db.sessions.get(id);
      if (!s) throw new Error('Sesi tidak ditemukan');
      fn(s);
      await db.sessions.put(s);
      return s;
    });
  }

  async function logSet(id: number, exIdx: number, setIdx: number, r: { reps: number; load?: number }) {
    const settings = await requireSettings();
    const session = await patchSession(id, (s) => {
      const e = s.exercises[exIdx];
      const l = e.logged[setIdx];
      l.reps = r.reps;
      l.load = r.load;
      l.done = true;
      e.skipped = false;
    });
    const ex = session.exercises[exIdx];
    if (ex.planned[setIdx].kind !== 'calibration' || r.load === undefined) return session;

    const def = EXERCISE_BY_ID[ex.exerciseId];
    const before = await db.states.get(def.id);
    const snapshotted = session.stateSnapshots && def.id in session.stateSnapshots;
    // kalibrasi ulang di sesi yang sama: mulai lagi dari state sebelum sesi ini
    const base = (snapshotted ? session.stateSnapshots![def.id] : before) ?? initialState(def);
    const calibrated = applyCalibration(def, base, settings.equipment, { load: r.load, reps: r.reps }, targetRir(settings.programStart, session.date));
    await db.states.put(calibrated);

    let load = calibrated.load!;
    if (def.loadMode) {
      if (session.deload) load = roundDownToAchievable(settings.equipment, def.loadMode, load * DELOAD_LOAD_FACTOR);
      if (ex.kneeReduced) load = roundDownToAchievable(settings.equipment, def.loadMode, load * KNEE_LOAD_FACTOR);
    }
    return patchSession(id, (s) => {
      if (!snapshotted) s.stateSnapshots = { ...s.stateSnapshots, [def.id]: before ?? null };
      const e = s.exercises[exIdx];
      e.planned.forEach((p, i) => {
        if (p.kind === 'work' && !e.logged[i].done) {
          p.load = load;
          e.logged[i].load = load;
        }
      });
    });
  }

  async function unlogSet(id: number, exIdx: number, setIdx: number) {
    return patchSession(id, (s) => {
      s.exercises[exIdx].logged[setIdx].done = false;
    });
  }

  async function setFeel(id: number, exIdx: number, feel: Feel) {
    return patchSession(id, (s) => {
      s.exercises[exIdx].feel = feel;
    });
  }

  async function skipExercise(id: number, exIdx: number, skipped = true) {
    return patchSession(id, (s) => {
      s.exercises[exIdx].skipped = skipped;
    });
  }

  async function updateSession(id: number, patch: Partial<SessionRecord>) {
    return patchSession(id, (s) => Object.assign(s, patch));
  }

  async function finishSession(id: number, opts: { kneePost?: number }) {
    const settings = await requireSettings();
    const session = await db.sessions.get(id);
    if (!session) throw new Error('Sesi tidak ditemukan');
    const states = await getStates();
    const updated: ExerciseState[] = [];
    for (const ex of session.exercises) {
      if (ex.skipped) continue;
      const def = EXERCISE_BY_ID[ex.exerciseId];
      if (!def) continue;
      const sets = ex.logged.filter((l) => l.done);
      if (sets.length === 0) continue;
      const state = states[def.id] ?? initialState(def);
      updated.push(
        finalizeExercise(def, state, settings.equipment, {
          sets,
          feel: ex.feel ?? 'pas',
          deload: session.deload,
          kneeReduced: ex.kneeReduced,
          today: session.date,
        }),
      );
    }
    await db.transaction('rw', db.states, db.sessions, async () => {
      await db.states.bulkPut(updated);
      await db.sessions.update(id, { status: 'done', finishedAt: Date.now(), kneePost: opts.kneePost });
    });
  }

  async function finishActiveDay(id: number, r: { minutes: number; mobility: boolean }) {
    await db.sessions.update(id, { status: 'done', finishedAt: Date.now(), activeMinutes: r.minutes, mobilityDone: r.mobility });
  }

  async function discardSession(id: number) {
    await db.transaction('rw', db.sessions, db.states, async () => {
      const s = await db.sessions.get(id);
      for (const [exId, prev] of Object.entries(s?.stateSnapshots ?? {})) {
        if (prev) await db.states.put(prev);
        else await db.states.delete(exId);
      }
      await db.sessions.delete(id);
    });
  }

  async function pendingKneeCheck(): Promise<SessionRecord | undefined> {
    const cs = await lastCSessions();
    const last = cs[cs.length - 1];
    if (!last || last.kneeNextDay !== undefined) return undefined;
    const d = daysBetween(last.date, now());
    return d >= 1 && d <= 2 ? last : undefined;
  }

  async function recordKneeNextDay(id: number, score: number) {
    await db.sessions.update(id, { kneeNextDay: score });
  }

  async function phase2Offer(): Promise<boolean> {
    const s = await requireSettings();
    if (s.phase2SnoozeUntil && daysBetween(now(), s.phase2SnoozeUntil) > 0) return false;
    const cs = (await lastCSessions()).slice(-2);
    const scores = cs.flatMap((c) => [c.kneePre, c.kneePost]).filter((x): x is number => x !== undefined);
    return phase2Eligible({ phase: s.phase, programStart: s.programStart, today: now(), recentKneeScores: scores });
  }

  async function acceptPhase2() {
    await saveSettings({ phase: 2 });
  }

  async function snoozePhase2(untilISO: string) {
    await saveSettings({ phase2SnoozeUntil: untilISO });
  }

  async function history(): Promise<SessionRecord[]> {
    return (await doneSessions()).reverse();
  }

  async function bodyWeights(): Promise<BodyWeight[]> {
    return db.bodyweights.orderBy('date').toArray();
  }

  async function addBodyWeight(kg: number) {
    const today = now();
    const existing = await db.bodyweights.where('date').equals(today).first();
    if (existing) await db.bodyweights.update(existing.id!, { kg });
    else await db.bodyweights.add({ date: today, kg });
    const s = await requireSettings();
    await saveSettings({ profile: { ...s.profile, weightKg: kg } });
  }

  async function proteinTarget(): Promise<number> {
    const s = await requireSettings();
    const bw = await bodyWeights();
    const w = bw[bw.length - 1]?.kg ?? s.profile.weightKg;
    const h = s.profile.heightCm / 100;
    const ideal = 25 * h * h;
    // untuk berat badan di atas ideal, pakai berat "disesuaikan"
    const adjusted = w > ideal ? ideal + 0.25 * (w - ideal) : w;
    return Math.round((1.6 * adjusted) / 5) * 5;
  }

  async function exportData(): Promise<string> {
    return JSON.stringify(
      {
        app: 'my-coach',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: await db.settings.toArray(),
        sessions: await db.sessions.toArray(),
        states: await db.states.toArray(),
        bodyweights: await db.bodyweights.toArray(),
      },
      null,
      2,
    );
  }

  async function importData(json: string) {
    const data = JSON.parse(json);
    if (data?.app !== 'my-coach' || !Array.isArray(data.settings) || !Array.isArray(data.sessions)) {
      throw new Error('File backup tidak valid');
    }
    await db.transaction('rw', [db.settings, db.sessions, db.states, db.bodyweights], async () => {
      await Promise.all([db.settings.clear(), db.sessions.clear(), db.states.clear(), db.bodyweights.clear()]);
      await db.settings.bulkPut(data.settings);
      await db.sessions.bulkPut(data.sessions);
      await db.states.bulkPut(data.states ?? []);
      await db.bodyweights.bulkPut(data.bodyweights ?? []);
    });
  }

  async function resetAll() {
    await db.transaction('rw', [db.settings, db.sessions, db.states, db.bodyweights], async () => {
      await Promise.all([db.settings.clear(), db.sessions.clear(), db.states.clear(), db.bodyweights.clear()]);
    });
  }

  async function updateExerciseState(st: ExerciseState) {
    await db.states.put(st);
  }

  return {
    getSettings,
    saveSettings,
    completeOnboarding,
    nextDay,
    currentSession,
    getSession,
    getStates,
    getState,
    kneeStatus,
    deloadStatus,
    previewPlan,
    startSession,
    logSet,
    unlogSet,
    setFeel,
    skipExercise,
    updateSession,
    finishSession,
    finishActiveDay,
    discardSession,
    pendingKneeCheck,
    recordKneeNextDay,
    phase2Offer,
    acceptPhase2,
    snoozePhase2,
    history,
    bodyWeights,
    addBodyWeight,
    proteinTarget,
    exportData,
    importData,
    resetAll,
    updateExerciseState,
  };
}

export type DayInfo = { dayType: DayType; seqIndex: number };
