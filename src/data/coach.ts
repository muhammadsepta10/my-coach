/**
 * Service "coach": menghubungkan logika coach (murni) dengan penyimpanan IndexedDB.
 */
import { addDays, daysBetween } from '../coach/dates';
import { DELOAD_LOAD_FACTOR, isDeloadActive, shouldDeload } from '../coach/deload';
import { KNEE_LOAD_FACTOR, kneeAccess, kneeModifier } from '../coach/knee';
import { type EquipmentConfig, roundDownToAchievable } from '../coach/plates';
import { type PlanContext, type PlannedExercise, finalizeExercise, planAlternatives, planSession, planSlotExercise, targetRir } from '../coach/planner';
import { EXERCISE_BY_ID, SLOT_BY_ID } from '../coach/program';
import { type SelectionHistory, blockIndexFor, blockStartFor, selectExercises, slotIdOf } from '../coach/selection';
import { applyCalibration, initialState } from '../coach/progression';
import { nextDay as rotationNext, phase2Eligible } from '../coach/rotation';
import type { DayType, ExerciseState, Feel, TrainingDay } from '../coach/types';
import type { BodyWeight, CoachDB, Profile, SessionExercise, SessionRecord, Settings } from './db';

export type Coach = ReturnType<typeof createCoach>;

export function createCoach(db: CoachDB, now: () => string) {
  async function getSettings(): Promise<Settings | undefined> {
    const s = await db.settings.get('settings');
    return s && withDefaults(s);
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
      favorites: [],
      banned: [],
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

  /** slot → gerakan terakhir yang mengisinya, dan core sesi latihan terakhir */
  async function selectionHistory(): Promise<SelectionHistory> {
    const done = (await doneSessions()).filter((d) => d.dayType !== 'AKTIF');
    const lastBySlot: Record<string, string> = {};
    for (const d of done) {
      for (const e of d.exercises) {
        const def = EXERCISE_BY_ID[e.exerciseId];
        // gerakan yang dilewati tidak dihitung sebagai "dipakai"
        if (def && !e.skipped) lastBySlot[e.slotId ?? slotIdOf(def)] = e.exerciseId;
      }
    }
    const last = done[done.length - 1];
    const lastCore = last
      ? last.exercises.filter((e) => !e.skipped && EXERCISE_BY_ID[e.exerciseId]?.block === 'core').map((e) => e.exerciseId)
      : [];
    return { lastBySlot, lastCore };
  }

  async function planContext(p: { dayType: DayType; today: string; deload: boolean; kneeReduce: boolean }): Promise<PlanContext> {
    const settings = await requireSettings();
    const knee = kneeAccess(await lastCSessions(), settings.phase, p.kneeReduce);
    const swaps = settings.pendingSwaps?.dayType === p.dayType ? settings.pendingSwaps.picks : undefined;
    return {
      ...p,
      states: await getStates(),
      eq: settings.equipment,
      programStart: settings.programStart,
      kneeMediumOpen: knee.mediumOpen,
      kneeHighOpen: knee.highOpen,
      history: await selectionHistory(),
      favorites: settings.favorites,
      banned: settings.banned,
      block: settings.block,
      overrides: swaps,
    };
  }

  /** Rencana hari berikutnya tanpa menyimpan apa pun (untuk Beranda). */
  async function previewPlan() {
    const settings = await requireSettings();
    const today = now();
    const { dayType } = await nextDay();
    const d = dayType === 'AKTIF' ? { active: false } : await deloadStatus();
    const deload = d.active || ('reason' in d && !!d.reason);
    const knee = await kneeStatus(undefined);
    const deloadReason = d.active ? settings.deloadReason : 'reason' in d ? d.reason : undefined;
    const plan = planSession(await planContext({ dayType, today, deload, kneeReduce: knee.reduce }));
    return { ...plan, deloadReason };
  }

  /** Alternatif "Ganti gerakan" untuk gerakan ke-`index` di pratinjau Beranda. */
  async function previewSwapOptions(index: number) {
    const plan = await previewPlan();
    const cur = plan.exercises[index];
    if (!cur) return [];
    const knee = await kneeStatus(undefined);
    const ctx = await planContext({ dayType: plan.dayType, today: now(), deload: plan.deload, kneeReduce: knee.reduce });
    return planAlternatives(ctx, cur.slotId, cur.def.id, plan.exercises.map((e) => e.def));
  }

  /** Simpan pilihan "Ganti gerakan" dari pratinjau; dipakai sekali saat sesi berikutnya dimulai. */
  async function previewSwap(slotId: string, exerciseId: string) {
    const s = await requireSettings();
    const { dayType } = await nextDay();
    const prev = s.pendingSwaps?.dayType === dayType ? s.pendingSwaps.picks : {};
    await saveSettings({ pendingSwaps: { dayType, picks: { ...prev, [slotId]: exerciseId } } });
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
    const knee = dayType === 'C' ? await kneeStatus(opts.kneePre) : await kneeStatus(undefined);
    const plan = planSession(await planContext({ dayType, today, deload, kneeReduce: knee.reduce }));
    const notes = [...plan.notes];
    if (dayType === 'C' && knee.reduce && 'reason' in knee && knee.reason) notes.unshift(knee.reason);
    if (deload) {
      const s = await requireSettings();
      if (s.deloadReason) notes.unshift(`Minggu ringan: ${s.deloadReason}.`);
    }

    const exercises = plan.exercises.map(toSessionExercise);

    const rec: SessionRecord = {
      date: today,
      dayType,
      seqIndex,
      phase: settings.phase,
      status: 'in_progress',
      deload,
      inCalibrationPhase: plan.inCalibrationPhase,
      kneeReduce: knee.reduce,
      notes,
      kneePre: opts.kneePre,
      exercises,
      cursor: 0,
      startedAt: Date.now(),
    };
    await db.transaction('rw', db.sessions, db.settings, db.states, async () => {
      rec.id = await db.sessions.add(rec);
      const patch: Partial<Settings> = {};
      if (dayType !== 'AKTIF') patch.pendingSwaps = undefined;
      if (plan.blockChanged && plan.block) patch.block = plan.block;
      if (Object.keys(patch).length) await db.settings.update('settings', patch);
      // gerakan yang diganti karena mandek mulai dari nol lagi kalau nanti kembali
      for (const id of plan.rotatedAway) await db.states.update(id, { stallStreak: 0 });
    });
    return rec;
  }

  async function sessionContext(session: SessionRecord): Promise<PlanContext> {
    const ctx = await planContext({
      dayType: session.dayType,
      today: session.date,
      deload: session.deload,
      kneeReduce: session.kneeReduce ?? session.exercises.some((e) => e.kneeReduced),
    });
    return { ...ctx, overrides: undefined };
  }

  /** Alternatif "Ganti gerakan" untuk gerakan di sesi yang sedang berjalan. */
  async function swapOptions(id: number, exIdx: number) {
    const session = await db.sessions.get(id);
    const ex = session?.exercises[exIdx];
    if (!session || !ex) return [];
    const def = EXERCISE_BY_ID[ex.exerciseId];
    const ctx = await sessionContext(session);
    const defs = session.exercises.map((e) => EXERCISE_BY_ID[e.exerciseId]).filter(Boolean);
    return planAlternatives(ctx, ex.slotId ?? slotIdOf(def), def.id, defs);
  }

  /** set kerja yang sudah dicatat mengunci gerakan (urungkan dulu untuk ganti) */
  function swapLocked(ex: SessionExercise): boolean {
    return ex.logged.some((l, i) => l.done && ex.planned[i].kind !== 'warmup');
  }

  async function swapExercise(id: number, exIdx: number, exerciseId: string) {
    const session = await db.sessions.get(id);
    if (!session) throw new Error('Sesi tidak ditemukan');
    const ex = session.exercises[exIdx];
    if (swapLocked(ex)) throw new Error('Urungkan dulu set yang sudah dicatat sebelum mengganti gerakan.');
    const options = await swapOptions(id, exIdx);
    if (!options.some((o) => o.def.id === exerciseId)) throw new Error('Gerakan ini tidak bisa dipakai untuk slot ini.');
    const def = EXERCISE_BY_ID[exerciseId];
    const slotId = ex.slotId ?? slotIdOf(EXERCISE_BY_ID[ex.exerciseId]);
    const ctx = await sessionContext(session);
    const giveWarmup = !session.exercises
      .slice(0, exIdx)
      .some((e) => !e.skipped && e.planned.some((p) => p.kind === 'warmup' || p.kind === 'calibration'));
    const next = toSessionExercise(planSlotExercise(ctx, def, slotId, giveWarmup));
    const updated = await patchSession(id, (s) => {
      s.exercises[exIdx] = next;
    });
    const settings = await requireSettings();
    if (SLOT_BY_ID[slotId]?.role === 'primary' && settings.block) {
      await saveSettings({ block: { ...settings.block, assignments: { ...settings.block.assignments, [slotId]: def.id } } });
    }
    return updated;
  }

  async function toggleFavorite(exerciseId: string) {
    const s = await requireSettings();
    const on = !s.favorites.includes(exerciseId);
    await saveSettings({
      favorites: on ? [...s.favorites, exerciseId] : s.favorites.filter((x) => x !== exerciseId),
      banned: s.banned.filter((x) => x !== exerciseId),
    });
  }

  async function toggleBanned(exerciseId: string) {
    const s = await requireSettings();
    const on = !s.banned.includes(exerciseId);
    await saveSettings({
      banned: on ? [...s.banned, exerciseId] : s.banned.filter((x) => x !== exerciseId),
      favorites: s.favorites.filter((x) => x !== exerciseId),
    });
  }

  /** Blok 4 minggu saat ini dan gerakan utamanya (untuk kartu "Blok baru"). */
  async function blockStatus() {
    const s = await requireSettings();
    const today = now();
    const index = blockIndexFor(s.programStart, today);
    let block = s.block?.index === index ? s.block : undefined;
    if (!block) {
      const knee = await kneeStatus(undefined);
      const ctx = await planContext({ dayType: 'A', today, deload: false, kneeReduce: knee.reduce });
      block = selectExercises({
        dayType: 'A',
        today,
        programStart: s.programStart,
        states: ctx.states,
        history: ctx.history!,
        favorites: s.favorites,
        banned: s.banned,
        block: s.block,
        knee: kneeAccess(await lastCSessions(), s.phase, knee.reduce),
      }).block;
    }
    const start = blockStartFor(s.programStart, index);
    const days: TrainingDay[] = ['A', 'B', 'C'];
    const primaries = days.flatMap((day) =>
      Object.entries(block!.assignments)
        .filter(([slot]) => SLOT_BY_ID[slot]?.day === day)
        .map(([slot, id]) => ({ day, slotId: slot, slot: SLOT_BY_ID[slot].label, exerciseId: id, name: EXERCISE_BY_ID[id]?.name ?? id })),
    );
    return {
      index,
      start,
      end: addDays(start, index === 0 ? 13 : 27),
      primaries,
      showCard: index >= 1 && daysBetween(start, today) < 7 && s.blockCardSeen !== index,
    };
  }

  /** tingkat lutut yang terbuka sekarang (untuk alasan kunci di Pustaka) */
  async function kneeAccessNow() {
    const s = await requireSettings();
    const knee = await kneeStatus(undefined);
    return kneeAccess(await lastCSessions(), s.phase, knee.reduce);
  }

  async function dismissBlockCard(index: number) {
    await saveSettings({ blockCardSeen: index });
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
      const state = states[def.id] ?? ex.seed ?? initialState(def);
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
        version: 2,
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
      await db.settings.bulkPut(data.settings.map(withDefaults));
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
    previewSwapOptions,
    previewSwap,
    startSession,
    swapOptions,
    swapLocked,
    swapExercise,
    toggleFavorite,
    toggleBanned,
    blockStatus,
    dismissBlockCard,
    kneeAccessNow,
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

function toSessionExercise(p: PlannedExercise): SessionExercise {
  return {
    exerciseId: p.def.id,
    slotId: p.slotId,
    ...(p.seed ? { seed: p.seed } : {}),
    displayName: p.displayName,
    restSec: p.restSec,
    tempo: p.tempo,
    kneeReduced: p.kneeReduced,
    notes: p.notes,
    planned: p.sets,
    logged: p.sets.map((ps) => ({ kind: ps.kind, reps: 0, load: ps.load, done: false })),
  };
}

/** pengaturan lama/backup lama belum punya field bank gerakan */
function withDefaults(s: Settings): Settings {
  return { ...s, favorites: s.favorites ?? [], banned: s.banned ?? [] };
}

export type DayInfo = { dayType: DayType; seqIndex: number };
