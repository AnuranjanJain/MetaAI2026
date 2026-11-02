// Room tunes: a tiny local music player. Eight original synth loops played
// with WebAudio — no files, no network, no account needed — plus the user's
// own uploaded audio files, persisted in IndexedDB, and named playlists over
// both, persisted in localStorage. One shared queue, so the room speakers
// and the dock card never disagree.

export interface Track {
  id: string;
  title: string;
  artist: string;
  mood: string;
  bpm: number;
  /** MIDI notes for one loop; 0 = rest. */
  notes: number[];
  root: number;
}

export const TRACKS: Track[] = [
  { id: 'morning', title: 'Morning Window', artist: 'Ivory Keys', mood: 'calm · bright', bpm: 76, root: 48, notes: [72, 76, 79, 76, 74, 79, 81, 79, 72, 76, 79, 76, 74, 71, 74, 0] },
  { id: 'desk', title: 'Desk Focus', artist: 'Pocket Loops', mood: 'steady · lo-fi', bpm: 84, root: 45, notes: [69, 0, 72, 0, 76, 0, 72, 0, 67, 0, 71, 0, 74, 0, 71, 0] },
  { id: 'rain', title: 'Rain on Glass', artist: 'Roomtone', mood: 'soft · slow', bpm: 62, root: 50, notes: [74, 0, 0, 77, 0, 0, 76, 0, 74, 0, 0, 71, 0, 0, 0, 0] },
  { id: 'sunroom', title: 'Sunroom', artist: 'Sage & Cedar', mood: 'warm · easy', bpm: 92, root: 53, notes: [77, 81, 84, 81, 79, 84, 86, 84, 77, 81, 84, 81, 79, 76, 79, 0] },
  { id: 'evening', title: 'Evening Pack-Down', artist: 'Ivory Keys', mood: 'mellow · dusk', bpm: 70, root: 43, notes: [67, 71, 74, 71, 72, 76, 79, 76, 67, 71, 74, 71, 69, 65, 69, 0] },
  { id: 'shelf', title: 'Shelf Shuffle', artist: 'The Shelf Club', mood: 'bouncy · tidy', bpm: 104, root: 47, notes: [71, 74, 78, 74, 71, 74, 78, 81, 79, 76, 79, 76, 74, 71, 74, 0] },
  { id: 'night', title: 'Night Hallway', artist: 'Roomtone', mood: 'quiet · deep', bpm: 58, root: 41, notes: [65, 0, 0, 0, 69, 0, 0, 0, 72, 0, 69, 0, 65, 0, 0, 0] },
  { id: 'getaway', title: 'Out the Door', artist: 'Doorway Band', mood: 'upbeat · go', bpm: 112, root: 50, notes: [74, 78, 81, 78, 83, 81, 78, 74, 76, 79, 83, 79, 81, 79, 76, 0] },
];

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Listener = () => void;

function loadFavorites(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('pocketroom.fav-tracks') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** A user-uploaded file, kept as an object URL for this session. */
export interface CustomTrack {
  id: string;
  title: string;
  url: string;
}

/** One playable entry, builtin or uploaded — what the UI renders. */
export interface QueueItem {
  key: string;
  title: string;
  artist: string;
  mood: string;
  custom: boolean;
}

/** A named mix of builtin loop ids and upload ids, in play order. */
export interface Playlist {
  id: string;
  name: string;
  keys: string[];
}

const PLAYLISTS_KEY = 'pocketroom.playlists';
const MAX_PLAYLISTS = 50;
const MAX_PLAYLIST_TRACKS = 200;
const MAX_PLAYLIST_NAME = 40;
const MAX_TRACK_KEY = 120;

/** Allowlist stored rows into exact-shape playlists. Drops malformed rows
    and keys instead of throwing — storage is untrusted input. Pure. */
export function sanitizePlaylists(value: unknown): Playlist[] {
  if (!Array.isArray(value)) return [];
  const out: Playlist[] = [];
  for (const row of value.slice(0, MAX_PLAYLISTS)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || r.id.length > MAX_TRACK_KEY) continue;
    if (typeof r.name !== 'string') continue;
    const name = r.name.trim().slice(0, MAX_PLAYLIST_NAME);
    if (!name) continue;
    if (!Array.isArray(r.keys)) continue;
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const k of r.keys) {
      if (typeof k !== 'string' || !k || k.length > MAX_TRACK_KEY || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
      if (keys.length >= MAX_PLAYLIST_TRACKS) break;
    }
    out.push({ id: r.id, name, keys });
  }
  return out;
}

function loadPlaylists(): Playlist[] {
  try {
    return sanitizePlaylists(JSON.parse(localStorage.getItem(PLAYLISTS_KEY) ?? '[]'));
  } catch { return []; }
}

/** IndexedDB keeps upload blobs across reloads (localStorage is too small
    for audio). Every helper resolves null/offline instead of throwing. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open('pocketroom', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('uploads', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

interface StoredUpload { id: string; title: string; blob: Blob }

async function readAllUploads(db: IDBDatabase): Promise<StoredUpload[]> {
  return new Promise((resolve, reject) => {
    try {
      const rq = db.transaction('uploads', 'readonly').objectStore('uploads').getAll();
      rq.onsuccess = () => resolve((rq.result ?? []) as StoredUpload[]);
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
}

async function putUpload(db: IDBDatabase, row: StoredUpload): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const rq = db.transaction('uploads', 'readwrite').objectStore('uploads').put(row);
      rq.onsuccess = () => resolve();
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
}

async function deleteUpload(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const rq = db.transaction('uploads', 'readwrite').objectStore('uploads').delete(id);
      rq.onsuccess = () => resolve();
      rq.onerror = () => resolve();
    } catch { resolve(); }
  });
}

class Player {
  index = 0;
  playing = false;
  favorites = new Set<string>(loadFavorites());
  /** Uploaded tracks, newest last. Always queued ahead of the builtins. */
  custom: CustomTrack[] = [];
  /** Named mixes over uploads + builtins, persisted in localStorage. */
  playlists: Playlist[] = loadPlaylists();
  /** When set, the queue narrows to that playlist's members. */
  activePlaylistId: string | null = null;
  /** Transient UI note (upload rejected, file unplayable…). Cleared on play. */
  notice = '';
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private tick: number | null = null;
  private step = 0;
  private cycleStart = 0;
  private nextAt = 0;
  private audio: HTMLAudioElement | null = null;
  private audioKey: string | null = null;
  private listeners = new Set<Listener>();

  /** Full library: uploads first (newest last), then the builtin loops. */
  get library(): QueueItem[] {
    const mine = this.custom.map((c) => ({
      key: c.id, title: c.title, artist: 'My upload', mood: 'your music', custom: true,
    }));
    const built = TRACKS.map((t) => ({
      key: t.id, title: t.title, artist: t.artist, mood: t.mood, custom: false,
    }));
    return [...mine, ...built];
  }

  /** What actually plays: the active playlist's members in order, or the
      full library. Missing uploads drop out; an empty-resolving playlist
      falls back to the library so playback never strands. */
  get queue(): QueueItem[] {
    const active = this.activePlaylist();
    if (!active) return this.library;
    const byKey = new Map(this.library.map((q) => [q.key, q]));
    const narrowed = active.keys
      .map((k) => byKey.get(k))
      .filter((q): q is QueueItem => !!q);
    return narrowed.length ? narrowed : this.library;
  }

  activePlaylist(): Playlist | null {
    if (!this.activePlaylistId) return null;
    return this.playlists.find((p) => p.id === this.activePlaylistId) ?? null;
  }

  /** Play one mix (index resets to its first member), or null for everything. */
  playPlaylist(id: string | null): void {
    this.activePlaylistId = id && this.playlists.some((p) => p.id === id) ? id : null;
    this.index = 0;
    this.step = 0;
    this.play();
  }

  /** Leave mix mode for the full library, staying on the current track. */
  exitPlaylist(): void {
    if (!this.activePlaylistId) return;
    const key = this.track.key;
    this.activePlaylistId = null;
    const at = this.queue.findIndex((q) => q.key === key);
    this.index = Math.max(0, at);
    this.step = 0;
    if (this.playing) this.play();
    else this.emit();
  }

  /** Name a new empty mix. Null when blank or the shelf is full. */
  createPlaylist(name: string): Playlist | null {
    const clean = name.trim().slice(0, MAX_PLAYLIST_NAME);
    if (!clean || this.playlists.length >= MAX_PLAYLISTS) return null;
    const pl: Playlist = {
      id: `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: clean, keys: [],
    };
    this.playlists.push(pl);
    this.savePlaylists();
    this.emit();
    return pl;
  }

  deletePlaylist(id: string): boolean {
    const at = this.playlists.findIndex((p) => p.id === id);
    if (at < 0) return false;
    this.playlists.splice(at, 1);
    if (this.activePlaylistId === id) {
      this.activePlaylistId = null;
      this.clampIndex();
    }
    this.savePlaylists();
    this.emit();
    return true;
  }

  /** Append one library track to a mix. False when unknown, full, or duped. */
  addToPlaylist(id: string, key: string): boolean {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || pl.keys.length >= MAX_PLAYLIST_TRACKS || pl.keys.includes(key)) return false;
    const known = this.custom.some((c) => c.id === key) || TRACKS.some((t) => t.id === key);
    if (!known) return false;
    pl.keys.push(key);
    this.savePlaylists();
    this.emit();
    return true;
  }

  removeFromPlaylist(id: string, key: string): boolean {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl) return false;
    const at = pl.keys.indexOf(key);
    if (at < 0) return false;
    pl.keys.splice(at, 1);
    this.clampIndex();
    this.savePlaylists();
    this.emit();
    return true;
  }

  private savePlaylists(): void {
    try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(this.playlists)); } catch { /* private mode */ }
  }

  get track(): QueueItem {
    const q = this.queue;
    return q[Math.max(0, Math.min(this.index, q.length - 1))]
      ?? { key: 'none', title: 'No music', artist: '', mood: '', custom: false };
  }

  isCustom(): boolean { return this.track.custom; }

  private clampIndex(): void {
    this.index = Math.max(0, Math.min(this.index, this.queue.length - 1));
  }

  /** The builtin loop for the current queue position, if it is one. */
  private builtin(): Track | null {
    const item = this.queue[this.index];
    if (!item || item.custom) return null;
    return TRACKS.find((t) => t.id === item.key) ?? null;
  }

  onChange(fn: Listener): void { this.listeners.add(fn); }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  /** 0..1 progress through the current loop (synth) or file (upload). */
  progress(): number {
    if (this.isCustom()) {
      const a = this.audio;
      if (!a || !a.duration || !isFinite(a.duration) || a.duration <= 0) return 0;
      return Math.max(0, Math.min(1, a.currentTime / a.duration));
    }
    const t = this.builtin();
    if (!t || !this.ctx || !this.playing) return 0;
    const loopSec = t.notes.length * (60 / t.bpm / 2);
    const elapsed = (this.ctx.currentTime - this.cycleStart) % loopSec;
    return Math.max(0, Math.min(1, elapsed / loopSec));
  }

  play(i?: number): void {
    if (i !== undefined && i !== this.index) {
      this.index = i;
      this.step = 0;
    }
    this.clampIndex();
    this.notice = '';
    const item = this.queue[this.index];
    if (!item) { this.playing = false; this.emit(); return; }
    if (item.custom) this.playCustom(item.key);
    else this.playBuiltin();
  }

  pause(): void {
    this.playing = false;
    this.stopScheduler();
    try { this.audio?.pause(); } catch { /* already stopped */ }
    try { void this.ctx?.suspend(); } catch { /* no synth running */ }
    this.emit();
  }

  toggle(): void { this.playing ? this.pause() : this.play(); }

  next(): void {
    const q = this.queue.length;
    if (q) this.play((this.index + 1) % q);
  }

  prev(): void {
    const q = this.queue.length;
    if (q) this.play((this.index - 1 + q) % q);
  }

  isFavorite(): boolean { return this.favorites.has(this.track.key); }

  toggleFavorite(): void {
    if (this.isFavorite()) this.favorites.delete(this.track.key);
    else this.favorites.add(this.track.key);
    try { localStorage.setItem('pocketroom.fav-tracks', JSON.stringify([...this.favorites])); } catch { /* private mode */ }
    this.emit();
  }

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

  private playBuiltin(): void {
    const t = this.builtin();
    if (!t || !this.ensureCtx()) { this.playing = false; this.emit(); return; }
    try { this.audio?.pause(); } catch { /* already stopped */ }
    void this.ctx!.resume();
    this.playing = true;
    this.cycleStart = this.ctx!.currentTime;
    this.nextAt = this.ctx!.currentTime + 0.06;
    this.startScheduler();
    this.emit();
  }

  private playCustom(key: string): void {
    this.stopScheduler();
    const entry = this.custom.find((c) => c.id === key);
    if (!entry) { this.playing = false; this.emit(); return; }
    if (typeof Audio === 'undefined') {
      this.notice = 'Audio files need a browser to play.';
      this.playing = false;
      this.emit();
      return;
    }
    try {
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.onended = () => this.next();
        this.audio.ontimeupdate = () => { if (this.playing && this.isCustom()) this.emit(); };
        this.audio.onerror = () => {
          if (!this.isCustom()) return;
          this.notice = 'That file would not play — it was removed.';
          void this.removeCurrentUpload();
        };
      }
      if (this.audioKey !== entry.id) {
        this.audio.src = entry.url;
        this.audioKey = entry.id;
      }
      const started = this.audio.play();
      this.playing = true;
      this.emit();
      if (started && typeof started.catch === 'function') {
        started.catch(() => {
          this.playing = false;
          this.notice = 'That file would not play.';
          this.emit();
        });
      }
    } catch {
      this.playing = false;
      this.notice = 'That file would not play.';
      this.emit();
    }
  }

  /** Uploads: validate, keep the blob across reloads, queue + play it. */
  async addUpload(file: File): Promise<void> {
    const audioLike = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(file.name);
    if (!audioLike) {
      this.notice = `"${file.name}" is not an audio file.`;
      this.emit();
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      this.notice = `"${file.name}" is over 30 MB — too big to keep.`;
      this.emit();
      return;
    }
    if (this.custom.length >= 200) {
      this.notice = 'Upload shelf is full (200) — remove one first.';
      this.emit();
      return;
    }
    const id = `up-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'My upload';
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      this.notice = 'Could not read that file.';
      this.emit();
      return;
    }
    this.custom.push({ id, title, url });
    this.notice = '';
    // Persist in the background; the track plays this session regardless.
    void this.persistUpload({ id, title, blob: file });
    this.play(this.custom.length - 1);
  }

  /** Remove whichever upload is currently selected. */
  async removeCurrentUpload(): Promise<void> {
    const item = this.track;
    if (!item.custom) return;
    await this.removeUpload(item.key, this.playing);
  }

  /** Remove one upload by id. When it was playing, `resume` starts the
      entry that slides into its place. */
  async removeUpload(id: string, resume = false): Promise<void> {
    const at = this.custom.findIndex((c) => c.id === id);
    if (at < 0) return;
    const selected = this.isCustom() && this.track.key === id;
    if (selected) this.pause();
    try { URL.revokeObjectURL(this.custom[at].url); } catch { /* already gone */ }
    this.custom.splice(at, 1);
    for (const pl of this.playlists) pl.keys = pl.keys.filter((k) => k !== id);
    this.savePlaylists();
    if (this.audio && this.audioKey === id) {
      try { this.audio.removeAttribute('src'); this.audio.load(); } catch { /* noop */ }
      this.audioKey = null;
    }
    const db = await openDb();
    if (db) {
      try { await deleteUpload(db, id); } catch { /* session-only */ }
      try { db.close(); } catch { /* noop */ }
    }
    this.clampIndex();
    this.notice = 'Upload removed.';
    if (resume) { this.notice = ''; this.play(); }
    else this.emit();
  }

  /** Load persisted uploads (object URLs are rebuilt each launch). */
  async loadCustom(): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
      const rows = await readAllUploads(db);
      this.custom = rows.map((r) => {
        let url = '';
        try { url = URL.createObjectURL(r.blob); } catch { /* unreadable row */ }
        return { id: r.id, title: r.title, url };
      }).filter((c) => c.url);
      this.clampIndex();
    } catch { /* stay with builtins */ }
    try { db.close(); } catch { /* noop */ }
    this.emit();
  }

  private async persistUpload(row: StoredUpload): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try { await putUpload(db, row); }
    catch { /* session-only — still plays until reload */ }
    try { db.close(); } catch { /* noop */ }
  }
  private startScheduler(): void {
    this.stopScheduler();
    const schedule = () => {
      if (!this.ctx || !this.gain) return;
      const t = this.builtin();
      if (!t) return;
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

// Rebuild persisted uploads in the background; the card updates via onChange.
void player.loadCustom();
