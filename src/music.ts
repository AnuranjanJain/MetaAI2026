// Room tunes: a tiny local music player. Eight original synth loops played
// with WebAudio — no files, no network, no account. Spotify cannot be played
// from here without OAuth and a registered app, so the UI links out to
// Spotify search instead of pretending to be connected.

export interface Track {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  /** MIDI notes for one loop; 0 = rest. */
  notes: number[];
  root: number;
}

export const TRACKS: Track[] = [
  { id: 'morning', title: 'Morning Window', mood: 'calm · bright', bpm: 76, root: 48, notes: [72, 76, 79, 76, 74, 79, 81, 79, 72, 76, 79, 76, 74, 71, 74, 0] },
  { id: 'desk', title: 'Desk Focus', mood: 'steady · lo-fi', bpm: 84, root: 45, notes: [69, 0, 72, 0, 76, 0, 72, 0, 67, 0, 71, 0, 74, 0, 71, 0] },
  { id: 'rain', title: 'Rain on Glass', mood: 'soft · slow', bpm: 62, root: 50, notes: [74, 0, 0, 77, 0, 0, 76, 0, 74, 0, 0, 71, 0, 0, 0, 0] },
  { id: 'sunroom', title: 'Sunroom', mood: 'warm · easy', bpm: 92, root: 53, notes: [77, 81, 84, 81, 79, 84, 86, 84, 77, 81, 84, 81, 79, 76, 79, 0] },
  { id: 'evening', title: 'Evening Pack-Down', mood: 'mellow · dusk', bpm: 70, root: 43, notes: [67, 71, 74, 71, 72, 76, 79, 76, 67, 71, 74, 71, 69, 65, 69, 0] },
  { id: 'shelf', title: 'Shelf Shuffle', mood: 'bouncy · tidy', bpm: 104, root: 47, notes: [71, 74, 78, 74, 71, 74, 78, 81, 79, 76, 79, 76, 74, 71, 74, 0] },
  { id: 'night', title: 'Night Hallway', mood: 'quiet · deep', bpm: 58, root: 41, notes: [65, 0, 0, 0, 69, 0, 0, 0, 72, 0, 69, 0, 65, 0, 0, 0] },
  { id: 'getaway', title: 'Out the Door', mood: 'upbeat · go', bpm: 112, root: 50, notes: [74, 78, 81, 78, 83, 81, 78, 74, 76, 79, 83, 79, 81, 79, 76, 0] },
];

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Listener = () => void;

class Player {
  index = 0;
  playing = false;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private tick: number | null = null;
  private step = 0;
  private cycleStart = 0;
  private nextAt = 0;
  private listeners = new Set<Listener>();

  get track(): Track { return TRACKS[this.index]; }

  onChange(fn: Listener): void { this.listeners.add(fn); }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  /** 0..1 progress through the current loop. */
  progress(): number {
    const t = this.track;
    const loopSec = t.notes.length * (60 / t.bpm / 2);
    if (!this.ctx || !this.playing) return 0;
    const elapsed = (this.ctx.currentTime - this.cycleStart) % loopSec;
    return Math.max(0, Math.min(1, elapsed / loopSec));
  }

  play(i?: number): void {
    if (!this.ensureCtx()) return;
    if (i !== undefined && i !== this.index) {
      this.index = i;
      this.step = 0;
    }
    void this.ctx!.resume();
    this.playing = true;
    this.cycleStart = this.ctx!.currentTime;
    this.nextAt = this.ctx!.currentTime + 0.06;
    this.startScheduler();
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.stopScheduler();
    void this.ctx?.suspend();
    this.emit();
  }

  toggle(): void { this.playing ? this.pause() : this.play(); }

  next(): void { this.play((this.index + 1) % TRACKS.length); }
  prev(): void { this.play((this.index - 1 + TRACKS.length) % TRACKS.length); }

  private ensureCtx(): boolean {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.16;
        this.gain.connect(this.ctx.destination);
      }
      return true;
    } catch { return false; }
  }

  private startScheduler(): void {
    this.stopScheduler();
    const schedule = () => {
      if (!this.ctx || !this.gain) return;
      const t = this.track;
      const stepSec = 60 / t.bpm / 2;
      while (this.nextAt < this.ctx.currentTime + 0.35) {
        const note = t.notes[this.step % t.notes.length];
        if (note) this.tone(midi(note), this.nextAt, stepSec * 1.8, 'triangle', 0.5);
        if (this.step % 4 === 0) this.tone(midi(t.root), this.nextAt, stepSec * 3.4, 'sine', 0.8);
        if (this.step % t.notes.length === 0) this.cycleStart = this.nextAt;
        this.step++;
        this.nextAt += stepSec;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 180);
    this.tick = window.setInterval(() => this.emit(), 400);
  }

  private stopScheduler(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.tick !== null) window.clearInterval(this.tick);
    this.timer = null; this.tick = null;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.gain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.gain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}

export const player = new Player();
