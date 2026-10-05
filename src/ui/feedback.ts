import { useEffect } from 'react';

let ctx: AudioContext | null = null;

/** Bunyi "bip-bip" singkat lewat Web Audio (tanpa file suara). */
export function beep() {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    for (const offset of [0, 0.25]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.2);
    }
  } catch {
    // audio tidak tersedia
  }
}

/** Jaga layar tetap menyala selama latihan. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
        if (cancelled) await lock?.release();
      } catch {
        // tidak didukung / ditolak
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);
}
