/**
 * Service "coach": menghubungkan logika coach (murni) dengan penyimpanan IndexedDB.
 */
import { addDays, daysBetween } from '../coach/dates';
import { DELOAD_LOAD_FACTOR, isDeloadActive, shouldDeload } from '../coach/deload';
import {
  type BodyArea,
  type Injury,
  type InjuryState,
  type InjuryStatus,
  type Side,
  PAIN_THRESHOLD,
  PULIH_STABLE_SESSIONS,
  injuryState,
  painRising,
} from '../coach/injury';
import { type EquipmentConfig, roundDownToAchievable } from '../coach/plates';
import { type PlanContext, type PlannedExercise, finalizeExercise, planAlternatives, planSession, planSlotExercise, targetRir } from '../coach/planner';
import { EXERCISE_BY_ID, SLOT_BY_ID } from '../coach/program';
import { type SelectionHistory, blockIndexFor, blockStartFor, selectExercises, slotIdOf } from '../coach/selection';
import { applyCalibration, initialState } from '../coach/progression';
import { nextDay as rotationNext, phase2Eligible } from '../coach/rotation';
import type { DayType, ExerciseState, Feel, TrainingDay } from '../coach/types';
import { type BodyWeight, type CoachDB, type Profile, type SessionExercise, type SessionRecord, type Settings, migrateLegacyKnee } from './db';

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
      injuries: [],
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

  async function activeInjuries(): Promise<Injury[]> {
    return (await requireSettings()).injuries.filter((i) => !i.healedOn);
  }

  /** sesi selesai (urut kronologis) yang membebani area cedera ini */
  function loadedSessions(injury: Injury, done: SessionRecord[]): SessionRecord[] {
    return done.filter((d) => loadedAreas(d).has(injury.area) || d.pain?.[injury.id]?.post !== undefined);
  }

  /** cedera aktif + konteks hari ini (nyeri stabil, Akut sesi dari nyeri sebelum sesi) */
  async function injuryStates(prePain: Record<string, number> = {}): Promise<InjuryState[]> {
    const done = await doneSessions();
    return (await activeInjuries()).map((i) =>
      injuryState(
        i,
        loadedSessions(i, done).map((d) => d.pain?.[i.id]),
        prePain[i.id],
      ),
    );
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
    const rising = (await activeInjuries()).some((i) => painRising(loadedSessions(i, done).map((d) => d.pain?.[i.id])));
    const r = shouldDeload({
      today,
      programStart: s.programStart,
      lastDeloadStart: s.deloadStart,
      stallStreaks: states.map((st) => st.stallStreak),
      recentFeels: feels,
      painRising: rising,
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

  async function planContext(p: { dayType: DayType; today: string; deload: boolean; prePain?: Record<string, number> }): Promise<PlanContext> {
    const settings = await requireSettings();
    const { prePain, ...rest } = p;
    const swaps = settings.pendingSwaps?.dayType === p.dayType ? settings.pendingSwaps.picks : undefined;
    return {
      ...rest,
      states: await getStates(),
      eq: settings.equipment,
      programStart: settings.programStart,
      injuries: await injuryStates(prePain),
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
    const deloadReason = d.active ? settings.deloadReason : 'reason' in d ? d.reason : undefined;
    const plan = planSession(await planContext({ dayType, today, deload }));
    return { ...plan, deloadReason };
  }

  /** Alternatif "Ganti gerakan" untuk gerakan ke-`index` di pratinjau Beranda. */
  async function previewSwapOptions(index: number) {
    const plan = await previewPlan();
    const cur = plan.exercises[index];
    if (!cur) return [];
    const ctx = await planContext({ dayType: plan.dayType, today: now(), deload: plan.deload });
    return planAlternatives(ctx, cur.slotId, cur.def.id, plan.exercises.map((e) => e.def));
  }

  /** Simpan pilihan "Ganti gerakan" dari pratinjau; dipakai sekali saat sesi berikutnya dimulai. */
  async function previewSwap(slotId: string, exerciseId: string) {
    const s = await requireSettings();
    const { dayType } = await nextDay();
    const prev = s.pendingSwaps?.dayType === dayType ? s.pendingSwaps.picks : {};
    await saveSettings({ pendingSwaps: { dayType, picks: { ...prev, [slotId]: exerciseId } } });
  }

  /** `pain`: cek nyeri sebelum sesi per cedera aktif (id → 0–10) */
  async function startSession(opts: { pain?: Record<string, number> }): Promise<SessionRecord | undefined> {
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
    const prePain = opts.pain ?? {};
    const plan = planSession(await planContext({ dayType, today, deload, prePain }));
    const notes = [...plan.notes];
    const active = await activeInjuries();
    const akutOffers = active.filter((i) => i.status !== 'akut' && (prePain[i.id] ?? 0) >= PAIN_THRESHOLD).map((i) => i.id);
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
      notes,
      pain: Object.fromEntries(Object.entries(prePain).map(([id, pre]) => [id, { pre }])),
      ...(akutOffers.length ? { akutOffers } : {}),
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
    const prePain = Object.fromEntries(
      Object.entries(session.pain ?? {}).flatMap(([id, p]) => (p.pre !== undefined ? [[id, p.pre]] : [])),
    );
    const ctx = await planContext({ dayType: session.dayType, today: session.date, deload: session.deload, prePain });
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
      const ctx = await planContext({ dayType: 'A', today, deload: false });
      block = selectExercises({
        dayType: 'A',
        today,
        programStart: s.programStart,
        states: ctx.states,
        history: ctx.history!,
        favorites: s.favorites,
        banned: s.banned,
        block: s.block,
        injuries: ctx.injuries ?? [],
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

  async function addInjury(p: { area: BodyArea; side?: Side; status: InjuryStatus }): Promise<Injury> {
    const s = await requireSettings();
    const base = p.side ? `${p.area}-${p.side}` : p.area;
    let id = base;
    for (let n = 2; s.injuries.some((i) => i.id === id); n++) id = `${base}-${n}`;
    const injury: Injury = { id, area: p.area, ...(p.side ? { side: p.side } : {}), status: p.status, since: now() };
    await saveSettings({ injuries: [...s.injuries, injury] });
    return injury;
  }

  async function patchInjury(id: string, patch: Partial<Injury>) {
    const s = await requireSettings();
    await saveSettings({ injuries: s.injuries.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  async function setInjuryStatus(id: string, status: InjuryStatus) {
    await patchInjury(id, { status });
  }

  async function healInjury(id: string) {
    await patchInjury(id, { healedOn: now() });
  }

  /** cedera Pemulihan yang nyerinya stabil 4 sesi: tawarkan naik ke Pulih */
  async function pulihSuggestions(): Promise<Injury[]> {
    const today = now();
    return (await injuryStates())
      .filter((st) => st.injury.status === 'pemulihan' && st.stableSessions >= PULIH_STABLE_SESSIONS)
      .map((st) => st.injury)
      .filter((i) => !i.pulihSnoozeUntil || daysBetween(today, i.pulihSnoozeUntil) <= 0);
  }

  async function snoozePulih(id: string) {
    await patchInjury(id, { pulihSnoozeUntil: addDays(now(), 7) });
  }

  /** cedera aktif + konteks saat ini (untuk alasan kunci di Pustaka) */
  async function injuryStatesNow() {
    return injuryStates();
  }

  /** cedera aktif yang areanya dibebani sesi ini (untuk cek nyeri sesudah sesi) */
  async function loadedInjuries(id: number): Promise<Injury[]> {
    const session = await db.sessions.get(id);
    if (!session) return [];
    const areas = loadedAreas(session);
    return (await activeInjuries()).filter((i) => areas.has(i.area));
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

  /** `pain`: cek nyeri sesudah sesi per cedera yang dibebani (id → 0–10) */
  async function finishSession(id: number, opts: { pain?: Record<string, number> }) {
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
    const pain = { ...session.pain };
    const loaded = new Set((await loadedInjuries(id)).map((i) => i.id));
    for (const [injuryId, post] of Object.entries(opts.pain ?? {})) {
      if (loaded.has(injuryId)) pain[injuryId] = { ...pain[injuryId], post };
    }
    await db.transaction('rw', db.states, db.sessions, async () => {
      await db.states.bulkPut(updated);
      await db.sessions.update(id, { status: 'done', finishedAt: Date.now(), pain });
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

  /** cek nyeri keesokan hari: sesi terakhir yang membebani tiap cedera aktif, 1–2 hari lalu */
  async function pendingPainChecks(): Promise<{ session: SessionRecord; injury: Injury }[]> {
    const done = await doneSessions();
    const today = now();
    const out: { session: SessionRecord; injury: Injury }[] = [];
    for (const injury of await activeInjuries()) {
      const loaded = loadedSessions(injury, done);
      const last = loaded[loaded.length - 1];
      if (!last || last.pain?.[injury.id]?.nextDay !== undefined) continue;
      const d = daysBetween(last.date, today);
      if (d >= 1 && d <= 2) out.push({ session: last, injury });
    }
    return out;
  }

  async function recordNextDayPain(sessionId: number, injuryId: string, score: number) {
    await patchSession(sessionId, (s) => {
      s.pain = { ...s.pain, [injuryId]: { ...s.pain?.[injuryId], nextDay: score } };
    });
  }

  async function phase2Offer(): Promise<boolean> {
    const s = await requireSettings();
    if (s.phase2SnoozeUntil && daysBetween(now(), s.phase2SnoozeUntil) > 0) return false;
    const active = await activeInjuries();
    const done = await doneSessions();
    const scores = active.flatMap((i) =>
      loadedSessions(i, done)
        .slice(-2)
        .flatMap((d) => [d.pain?.[i.id]?.pre, d.pain?.[i.id]?.post])
        .filter((x): x is number => x !== undefined),
    );
    return phase2Eligible({ phase: s.phase, programStart: s.programStart, today: now(), recentPainScores: active.length ? scores : null });
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
      for (const st of data.settings as Settings[]) migrateLegacyKnee(st, data.sessions);
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
    activeInjuries,
    addInjury,
    setInjuryStatus,
    healInjury,
    pulihSuggestions,
    snoozePulih,
    injuryStatesNow,
    loadedInjuries,
    logSet,
    unlogSet,
    setFeel,
    skipExercise,
    updateSession,
    finishSession,
    finishActiveDay,
    discardSession,
    pendingPainChecks,
    recordNextDayPain,
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
    notes: p.notes,
    planned: p.sets,
    logged: p.sets.map((ps) => ({ kind: ps.kind, reps: 0, load: ps.load, done: false })),
  };
}

/** pengaturan lama/backup lama belum punya field bank gerakan */
function withDefaults(s: Settings): Settings {
  return { ...s, favorites: s.favorites ?? [], banned: s.banned ?? [], injuries: s.injuries ?? [] };
}

/** area yang dibebani sesi: gerakan yang tidak dilewati dan punya set tercatat */
function loadedAreas(s: SessionRecord): Set<BodyArea> {
  const areas = new Set<BodyArea>();
  for (const e of s.exercises) {
    if (e.skipped || !e.logged.some((l) => l.done)) continue;
    for (const area of Object.keys(EXERCISE_BY_ID[e.exerciseId]?.load ?? {})) areas.add(area as BodyArea);
  }
  return areas;
}

export type DayInfo = { dayType: DayType; seqIndex: number };
