/**
 * Pose awal (A) dan pose akhir (B) tiap gerakan. Animasi bolak-balik A ↔ B.
 * Koordinat viewBox 0 0 200 170, lantai di y = 158, figur menghadap kanan.
 */
import { FLOOR_Y, LIMB, type PoseSpec, type Vec, dir } from './skeleton';

export interface FrontPose {
  /** sudut lengan dari bawah (0) ke samping (90) */
  armOut: number;
  /** tekukan siku tambahan */
  elbow: number;
  /** 0 = tegak, 1 = membungkuk */
  lean: number;
}

export type Equip = { type: 'dumbbell' | 'barbell'; at: 'hands' | 'nearHand' | 'hip' };

export type Prop =
  | { type: 'chair'; x: number; w: number; seatY: number; back?: 'left' | 'right' }
  | { type: 'step'; x: number; w: number; h: number };

export type AnimSpec =
  | { view: 'side'; a: PoseSpec; b: PoseSpec; equip?: Equip; props?: Prop[]; isometric?: boolean; caption?: string }
  | { view: 'front'; a: FrontPose; b: FrontPose; equip?: Equip; isometric?: boolean; caption?: string };

const F = FLOOR_Y - 2;
const LEG = LIMB.thigh + LIMB.shin;
const BODY = LEG + LIMB.torso;

const at = (p: Vec, angle: number, len: number): Vec => [p[0] + dir(angle)[0] * len, p[1] + dir(angle)[1] * len];

/** Badan lurus seperti papan, dari pergelangan kaki dengan sudut tertentu. */
function plank(ankle: Vec, angle: number): Pick<PoseSpec, 'hip' | 'torso' | 'leg'> {
  return { hip: at(ankle, angle, LEG), torso: angle, leg: { target: ankle, bend: 'down' } };
}

const standing = (x = 100): PoseSpec => ({
  hip: [x, F - LEG],
  torso: 180,
  arm: { ua: 0, fa: 0 },
  leg: { th: 0, sh: 0 },
  foot: 90,
});

/** Berbaring telentang, kepala di kiri, lutut ditekuk. */
const lying = (over: Partial<PoseSpec> = {}): PoseSpec => ({
  hip: [122, 149],
  torso: -90,
  arm: { ua: 180, fa: 180 },
  leg: { target: [150, F], bend: 'up' },
  ...over,
});

const seated = (over: Partial<PoseSpec> = {}): PoseSpec => ({
  hip: [96, 112],
  torso: 180,
  arm: { ua: 0, fa: 0 },
  leg: { target: [132, F], bend: 'up' },
  foot: 90,
  ...over,
});

const seatChair: Prop = { type: 'chair', x: 78, w: 34, seatY: 118, back: 'left' };

const pushupA = plank([36, F], 134);
const pushupB = plank([36, F], 122);
const pushHands: Vec = [128, 120];
const pushChair: Prop = { type: 'chair', x: 112, w: 34, seatY: 120 };

const plankAngle = 180 - (Math.acos(LIMB.upperArm / BODY) * 180) / Math.PI;

export const ANIMATIONS: Record<string, AnimSpec> = {
  'floor-press': {
    view: 'side',
    a: lying({ arm: { target: [80, 103], bend: 'front' } }),
    b: lying({ arm: { target: [84, 128], bend: 'front' } }),
    equip: { type: 'dumbbell', at: 'hands' },
  },
  'push-up': {
    view: 'side',
    a: { ...pushupA, arm: { target: pushHands, bend: 'back' } },
    b: { ...pushupB, arm: { target: pushHands, bend: 'back' } },
    props: [pushChair],
    caption: 'Versi incline: tangan di kursi',
  },
  'seated-ohp': {
    view: 'side',
    a: seated({ arm: { target: [101, 64], bend: 'down' } }),
    b: seated({ arm: { target: [99, 20], bend: 'down' } }),
    equip: { type: 'dumbbell', at: 'hands' },
    props: [seatChair],
  },
  'lateral-raise': {
    view: 'front',
    a: { armOut: 8, elbow: 8, lean: 0 },
    b: { armOut: 84, elbow: 12, lean: 0 },
    equip: { type: 'dumbbell', at: 'hands' },
  },
  'barbell-curl': {
    view: 'side',
    a: standing(),
    b: { ...standing(), arm: { ua: 8, fa: 158 } },
    equip: { type: 'barbell', at: 'hands' },
  },
  'hammer-curl': {
    view: 'side',
    a: standing(),
    b: { ...standing(), arm: { ua: 6, fa: 150 } },
    equip: { type: 'dumbbell', at: 'hands' },
  },
  'bent-over-row': {
    view: 'side',
    a: { hip: [90, 92], torso: 132, head: 118, arm: { ua: 0, fa: 0 }, leg: { target: [100, F], bend: 'front' } },
    b: { hip: [90, 92], torso: 132, head: 118, arm: { target: [104, 92], bend: 'up' }, leg: { target: [100, F], bend: 'front' } },
    equip: { type: 'barbell', at: 'hands' },
  },
  'one-arm-row': {
    view: 'side',
    a: {
      hip: [84, 96],
      torso: 108,
      head: 100,
      arm: { ua: 0, fa: 0 },
      farArm: { target: [150, 118], bend: 'back' },
      leg: { target: [100, F], bend: 'front' },
      farLeg: { target: [70, F], bend: 'front' },
    },
    b: {
      hip: [84, 96],
      torso: 108,
      head: 100,
      arm: { target: [104, 96], bend: 'up' },
      farArm: { target: [150, 118], bend: 'back' },
      leg: { target: [100, F], bend: 'front' },
      farLeg: { target: [70, F], bend: 'front' },
    },
    equip: { type: 'dumbbell', at: 'nearHand' },
    props: [{ type: 'chair', x: 136, w: 34, seatY: 118 }],
  },
  'rear-delt-fly': {
    view: 'front',
    a: { armOut: 6, elbow: 10, lean: 1 },
    b: { armOut: 80, elbow: 14, lean: 1 },
    equip: { type: 'dumbbell', at: 'hands' },
    caption: 'Badan membungkuk ±45–60°',
  },
  'lying-tricep-ext': {
    view: 'side',
    a: lying({ arm: { ua: 192, fa: 192 } }),
    b: lying({ arm: { ua: 192, fa: 290 } }),
    equip: { type: 'dumbbell', at: 'hands' },
  },
  'overhead-tricep-ext': {
    view: 'side',
    a: seated({ arm: { ua: 172, fa: 176 } }),
    b: seated({ arm: { ua: 172, fa: 335 } }),
    equip: { type: 'dumbbell', at: 'nearHand' },
    props: [seatChair],
  },
  'close-grip-push-up': {
    view: 'side',
    a: { ...pushupA, arm: { target: pushHands, bend: 'back' } },
    b: { ...pushupB, arm: { target: pushHands, bend: 'back' } },
    props: [pushChair],
    caption: 'Siku rapat ke badan',
  },
  'goblet-box-squat': {
    view: 'side',
    a: { hip: [92, F - LEG + 4], torso: 180, arm: { ua: 15, fa: 162 }, leg: { target: [106, F], bend: 'front' } },
    b: { hip: [76, 113], torso: 148, head: 160, arm: { ua: -18, fa: 128 }, leg: { target: [106, F], bend: 'front' } },
    equip: { type: 'dumbbell', at: 'nearHand' },
    props: [{ type: 'chair', x: 50, w: 34, seatY: 120, back: 'left' }],
  },
  rdl: {
    view: 'side',
    a: standing(),
    b: { hip: [80, 92], torso: 102, head: 112, arm: { ua: 0, fa: 0 }, leg: { target: [102, F], bend: 'front' } },
    equip: { type: 'barbell', at: 'hands' },
  },
  'hip-thrust': {
    view: 'side',
    a: lying({ hip: [118, 149], arm: { target: [118, F], bend: 'down' } }),
    b: lying({ hip: [112, 125], torso: -60, head: -90, arm: { target: [118, F], bend: 'down' } }),
    equip: { type: 'barbell', at: 'hip' },
  },
  'step-up': {
    view: 'side',
    a: {
      hip: [94, 92],
      torso: 172,
      arm: { ua: 0, fa: 0 },
      leg: { target: [124, 134], bend: 'front' },
      farLeg: { target: [90, F], bend: 'front' },
    },
    b: {
      hip: [120, 68],
      torso: 180,
      arm: { ua: 0, fa: 0 },
      leg: { target: [124, 134], bend: 'front' },
      farLeg: { target: [112, 122], bend: 'front' },
    },
    props: [{ type: 'step', x: 110, w: 50, h: 22 }],
  },
  'calf-raise': {
    view: 'side',
    a: { ...standing(), leg: { th: 0, sh: 0 }, hip: [100, F - LEG], foot: 90 },
    b: { ...standing(), leg: { th: 0, sh: 0 }, hip: [100, F - LEG - 7], foot: 40 },
    equip: { type: 'dumbbell', at: 'hands' },
  },
  plank: {
    view: 'side',
    a: { ...plank([36, F], plankAngle), arm: { ua: 0, fa: 90 } },
    b: { ...plank([36, F], plankAngle + 0.8), arm: { ua: 0, fa: 90 } },
    isometric: true,
    caption: 'Tahan, badan lurus',
  },
  'dead-bug': {
    view: 'side',
    a: lying({ arm: { ua: 180, fa: 180 }, leg: { th: 180, sh: 90 } }),
    b: lying({
      arm: { ua: 180, fa: 180 },
      farArm: { ua: 262, fa: 262 },
      leg: { th: 180, sh: 90 },
      farLeg: { th: 96, sh: 94 },
    }),
  },
  'side-plank': {
    view: 'side',
    a: { ...plank([36, F], plankAngle - 6), arm: { ua: 0, fa: 90 }, farArm: { ua: 180, fa: 180 } },
    b: { ...plank([36, F], plankAngle), arm: { ua: 0, fa: 90 }, farArm: { ua: 180, fa: 180 } },
    caption: 'Bertumpu di satu lengan bawah, badan menyamping',
  },
  'bird-dog': {
    view: 'side',
    a: {
      hip: [70, F - LIMB.thigh],
      torso: 105,
      head: 95,
      arm: { target: [116, F], bend: 'back' },
      leg: { th: 0, sh: -90 },
    },
    b: {
      hip: [70, F - LIMB.thigh],
      torso: 105,
      head: 95,
      arm: { target: [116, F], bend: 'back' },
      farArm: { ua: 96, fa: 96 },
      leg: { th: -84, sh: -86 },
      farLeg: { th: 0, sh: -90 },
    },
  },
  'glute-bridge-hold': {
    view: 'side',
    a: lying({ hip: [112, 127], torso: -60, head: -90, arm: { target: [118, F], bend: 'down' } }),
    b: lying({ hip: [112, 125], torso: -60, head: -90, arm: { target: [118, F], bend: 'down' } }),
    isometric: true,
    caption: 'Tahan pinggul di atas',
  },
  'hollow-hold': {
    view: 'side',
    a: lying({ hip: [112, 151], torso: -100, head: -108, arm: { ua: 112, fa: 108 }, leg: { th: 140, sh: 80 } }),
    b: lying({ hip: [112, 151], torso: -103, head: -111, arm: { ua: 114, fa: 110 }, leg: { th: 143, sh: 83 } }),
    isometric: true,
    caption: 'Versi mudah: lutut ditekuk',
  },
};
