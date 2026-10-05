/**
 * Memilih gerakan untuk tiap slot hari ini dari bank gerakan.
 *
 * - Slot primer: gerakan blok 4 minggu (stabil supaya progres terukur), diganti
 *   lebih cepat kalau mandek atau tidak lagi boleh (lutut / 🚫).
 * - Slot aksesori & opsional: berganti tiap sesi, tidak mengulang sesi terakhir.
 * - Core: 1 anti-gerakan + 1 lainnya dari kolam bersama; carry hanya kalau dumbel terpasang.
 *
 * Fungsi murni & deterministik: input sama → pilihan sama (pratinjau = sesi yang dimulai).
 */
import { addDays, daysBetween } from './dates';
import { CALIBRATION_DAYS } from './deload';
import { type KneeAccess, kneeTierAllowed } from './knee';
import { family, orderExercises } from './ordering';
import { CORE_POOL, EXERCISE_BY_ID, SLOTS, SLOT_BY_ID, slotsForDay } from './program';
import type { ExerciseDef, ExerciseState, SlotDef, TrainingDay } from './types';

export const BLOCK_DAYS = 28;
/** slot primer yang mandek sekian sesi berturut-turut diganti lebih cepat */
export const EARLY_ROTATION_STALL = 3;

export const CORE_SLOTS = { anti: 'core:anti', other: 'core:other' } as const;

export interface BlockInfo {
  /** 0 = 2 minggu kalibrasi, lalu blok 1, 2, … tiap 28 hari */
  index: number;
  start: string;
  /** slot primer → gerakan selama blok ini */
  assignments: Record<string, string>;
}

export interface SelectionHistory {
  /** slot → gerakan pada sesi terakhir yang mengisi slot itu */
  lastBySlot: Record<string, string>;
  /** core pada sesi latihan terakhir */
  lastCore: string[];
}

export interface SelectionInput {
  dayType: TrainingDay;
  today: string;
  programStart: string;
  states: Record<string, ExerciseState>;
  history: SelectionHistory;
  favorites: string[];
  banned: string[];
  block?: BlockInfo;
  knee: KneeAccess;
  /** pilihan manual untuk sesi ini: slot → gerakan */
  overrides?: Record<string, string>;
}

export interface SlotPick {
  slotId: string;
  def: ExerciseDef;
}

export interface Selection {
  /** sudah diurutkan (primer dulu, lalu dikelompokkan per alat), core di akhir */
  picks: SlotPick[];
  block: BlockInfo;
  /** blok perlu disimpan (blok baru atau penugasan berubah) */
  blockChanged: boolean;
  /** gerakan primer yang diganti karena mandek */
  rotatedAway: string[];
  notes: string[];
}

export function blockIndexFor(programStart: string, today: string): number {
  const d = daysBetween(programStart, today);
  if (d < CALIBRATION_DAYS) return 0;
  return 1 + Math.floor((d - CALIBRATION_DAYS) / BLOCK_DAYS);
}

export function blockStartFor(programStart: string, index: number): string {
  return index === 0 ? programStart : addDays(programStart, CALIBRATION_DAYS + (index - 1) * BLOCK_DAYS);
}

export function isEligible(def: ExerciseDef, banned: string[], knee: KneeAccess): boolean {
  return !banned.includes(def.id) && kneeTierAllowed(def.kneeTier, knee);
}

/** hash string sederhana (FNV-1a) untuk memecah seri secara deterministik */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function eligibleCandidates(slot: SlotDef, input: Pick<SelectionInput, 'banned' | 'knee'>): string[] {
  return slot.candidates.filter((id) => isEligible(EXERCISE_BY_ID[id], input.banned, input.knee));
}

/**
 * Kandidat primer berikutnya setelah `after` (berputar sesuai urutan slot),
 * mengutamakan favorit. `after` sendiri hanya dipilih kalau tidak ada pilihan lain.
 */
function nextPrimary(slot: SlotDef, after: string | undefined, input: Pick<SelectionInput, 'banned' | 'knee' | 'favorites'>): string | undefined {
  const pool = eligibleCandidates(slot, input);
  const favs = pool.filter((id) => input.favorites.includes(id));
  const use = favs.length ? favs : pool;
  if (use.length === 0) return undefined;
  if (after === undefined) return use[0];
  const start = slot.candidates.indexOf(after);
  for (let k = 1; k <= slot.candidates.length; k++) {
    const id = slot.candidates[(start + k) % slot.candidates.length];
    if (use.includes(id) && id !== after) return id;
  }
  return use[0];
}

function newBlock(input: SelectionInput, index: number): BlockInfo {
  const assignments: Record<string, string> = {};
  for (const slot of SLOTS.filter((s) => s.role === 'primary')) {
    const def = slot.candidates[0];
    let pick: string | undefined;
    if (index <= 1) {
      // kalibrasi & blok pertama: gerakan asli (⭐) supaya data kalibrasi terpakai
      pick = eligibleCandidates(slot, input).includes(def) ? def : nextPrimary(slot, def, input);
    } else {
      pick = nextPrimary(slot, input.block?.assignments[slot.id] ?? def, input);
    }
    if (pick) assignments[slot.id] = pick;
  }
  return { index, start: blockStartFor(input.programStart, index), assignments };
}

function lockedNote(slot: SlotDef, input: SelectionInput): string {
  const kneeLocked = slot.candidates.some((id) => !kneeTierAllowed(EXERCISE_BY_ID[id].kneeTier, input.knee));
  if (kneeLocked) {
    return input.knee.reduce
      ? `${slot.label}: dilewati hari ini — lutut sedang sensitif, hanya gerakan ramah lutut.`
      : `${slot.label} (step-up dkk.) masih terkunci sampai lutut stabil (nyeri ≤2 di 2 sesi kaki berturut-turut).`;
  }
  return `${slot.label}: dilewati — semua gerakannya ditandai 🚫.`;
}

type Family = ReturnType<typeof family>;

function rankAccessory(pool: string[], slotId: string, current: Family, input: SelectionInput): string {
  const fav = (id: string) => (input.favorites.includes(id) ? 0 : 1);
  const fam = (id: string) => {
    const f = family(EXERCISE_BY_ID[id]);
    return f === 'none' || f === current ? 0 : 1;
  };
  const seed = (id: string) => hash(`${input.today}|${slotId}|${id}`);
  return [...pool].sort((a, b) => fav(a) - fav(b) || fam(a) - fam(b) || seed(a) - seed(b))[0];
}

/** core yang boleh untuk sub-tipe tertentu, dengan aturan carry */
export function corePool(type: 'anti' | 'other', assembled: Family, input: Pick<SelectionInput, 'banned' | 'knee'>): ExerciseDef[] {
  return CORE_POOL.filter((d) => d.coreType === type && isEligible(d, input.banned, input.knee) && (!d.carry || assembled === 'dumbbell'));
}

/** alat yang terpasang setelah gerakan utama selesai */
export function assembledAfter(defs: ExerciseDef[]): Family {
  let f: Family = 'none';
  for (const d of defs) if (family(d) !== 'none') f = family(d);
  return f;
}

export function selectExercises(input: SelectionInput): Selection {
  const notes: string[] = [];
  const rotatedAway: string[] = [];
  const idx = blockIndexFor(input.programStart, input.today);
  let block: BlockInfo;
  let blockChanged = false;
  if (!input.block || input.block.index !== idx) {
    block = newBlock(input, idx);
    blockChanged = true;
  } else {
    block = { ...input.block, assignments: { ...input.block.assignments } };
  }

  const main: SlotPick[] = [];
  let current: Family = 'none';
  for (const slot of slotsForDay(input.dayType)) {
    const override = input.overrides?.[slot.id];
    const pool = eligibleCandidates(slot, input);
    let pick: string | undefined;

    if (override && pool.includes(override)) {
      pick = override;
      if (slot.role === 'primary' && block.assignments[slot.id] !== override) {
        block.assignments[slot.id] = override;
        blockChanged = true;
      }
    } else if (slot.role === 'primary') {
      const assigned = block.assignments[slot.id];
      const stalled = assigned !== undefined && (input.states[assigned]?.stallStreak ?? 0) >= EARLY_ROTATION_STALL;
      pick = assigned;
      if (assigned === undefined || !pool.includes(assigned) || stalled) {
        const next = nextPrimary(slot, assigned, input);
        if (next !== undefined && next !== assigned) {
          pick = next;
          block.assignments[slot.id] = next;
          blockChanged = true;
          if (stalled && pool.includes(assigned)) {
            rotatedAway.push(assigned);
            notes.push(`${EXERCISE_BY_ID[assigned].name} mandek beberapa sesi — diganti ${EXERCISE_BY_ID[next].name} sampai akhir blok.`);
          }
        } else if (assigned !== undefined && !pool.includes(assigned)) {
          pick = undefined;
        }
      }
    } else if (pool.length) {
      const last = input.history.lastBySlot[slot.id];
      const fresh = pool.filter((id) => id !== last);
      pick = rankAccessory(fresh.length ? fresh : pool, slot.id, current, input);
    }

    if (pick === undefined) {
      notes.push(lockedNote(slot, input));
      continue;
    }
    const def = EXERCISE_BY_ID[pick];
    if (family(def) !== 'none') current = family(def);
    main.push({ slotId: slot.id, def });
  }

  const ordered = orderExercises(main.map((p) => p.def)).map((d) => main.find((p) => p.def === d)!);
  const assembled = assembledAfter(ordered.map((p) => p.def));

  const core: SlotPick[] = [];
  for (const type of ['anti', 'other'] as const) {
    const slotId = CORE_SLOTS[type];
    const pool = corePool(type, assembled, input).map((d) => d.id);
    if (!pool.length) continue;
    const override = input.overrides?.[slotId];
    let pick: string;
    if (override && pool.includes(override)) pick = override;
    else {
      const fresh = pool.filter((id) => !input.history.lastCore.includes(id));
      pick = rankAccessory(fresh.length ? fresh : pool, slotId, assembled, input);
    }
    core.push({ slotId, def: EXERCISE_BY_ID[pick] });
  }

  return { picks: [...ordered, ...core], block, blockChanged, rotatedAway, notes };
}

/** Alternatif yang boleh untuk satu slot (untuk tombol "Ganti gerakan"). */
export function slotAlternatives(
  slotId: string,
  currentId: string,
  assembled: Family,
  input: Pick<SelectionInput, 'banned' | 'knee'>,
): ExerciseDef[] {
  if (slotId === CORE_SLOTS.anti || slotId === CORE_SLOTS.other) {
    const type = slotId === CORE_SLOTS.anti ? 'anti' : 'other';
    return corePool(type, assembled, input).filter((d) => d.id !== currentId);
  }
  const slot = SLOT_BY_ID[slotId];
  if (!slot) return [];
  return eligibleCandidates(slot, input)
    .filter((id) => id !== currentId)
    .map((id) => EXERCISE_BY_ID[id]);
}

/** slot sebuah gerakan (untuk sesi lama yang belum menyimpan slot) */
export function slotIdOf(def: ExerciseDef): string {
  if (def.block === 'core') return def.coreType === 'anti' ? CORE_SLOTS.anti : CORE_SLOTS.other;
  return def.slot;
}
