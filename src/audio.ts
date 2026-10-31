// Clatter: optional local sound layer. Precomposed WebAudio motifs only —
// no model calls, no recording, no microphone. Silent unless enabled.

export type MotifName = 'desk' | 'doorway' | 'wardrobe' | 'shelf' | 'window' | 'done' | 'pack';

const MOTIFS: Record<MotifName, number[]> = {
  desk: [523.25, 587.33],
  doorway: [392.0, 523.25],
  wardrobe: [440.0, 554.37],
  shelf: [349.23, 440.0],
  window: [587.33, 783.99],
  pack: [659.25, 523.25],
  done: [523.25, 659.25, 783.99],
};

let ctx: AudioContext | null = null;
let enabled = false;
let muted = false;
let lastPlay = 0;

export function configureSound(opts: { enabled: boolean; muted: boolean }): void {
  enabled = opts.enabled;
  muted = opts.muted;
}

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, at: number, dur = 0.22): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Play a motif, throttled so rapid taps never stack into noise. */
export function playMotif(name: MotifName): void {
  if (!enabled || muted) return;
  const now = performance.now();
  if (now - lastPlay < 220) return;
  lastPlay = now;
  const ac = ensureCtx();
  if (!ac) return;
  const notes = MOTIFS[name];
  notes.forEach((f, i) => tone(ac, f, ac.currentTime + i * 0.14));
}

/** Short "Today's soundtrack": one phrase per area with progress. */
export function playSoundtrack(areas: MotifName[]): void {
  if (!enabled || muted || !areas.length) return;
  const ac = ensureCtx();
  if (!ac) return;
  let t = ac.currentTime + 0.05;
  for (const name of areas.slice(0, 6)) {
    for (const f of MOTIFS[name]) {
      tone(ac, f, t, 0.26);
      t += 0.16;
    }
    t += 0.12;
  }
}
