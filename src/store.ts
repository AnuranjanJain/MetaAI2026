// Central store: single AppState, localStorage persistence, undo snapshots,
// and subscriptions. All area views read and write through here so shared
// records stay consistent.

import type { AppState } from './core/types.js';
import { emptyState, nowIso, rolloverRepeats, seedState, todayKey } from './core/model.js';

const KEY = 'pocketroom.v1';
const UNDO_LIMIT = 30;

export type SaveState = 'saved' | 'saving' | 'error';
type Listener = (s: AppState) => void;

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seed = seedState();
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) throw new Error('shape');
    return { ...emptyState(), ...parsed, version: 1 };
  } catch {
    return seedState();
  }
}

class Store {
  state: AppState = load();
  saveState: SaveState = 'saved';
  private listeners = new Set<Listener>();
  private undoStack: AppState[] = [];
  private saveListeners = new Set<(s: SaveState) => void>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  onSaveState(fn: (s: SaveState) => void): () => void {
    this.saveListeners.add(fn);
    return () => { this.saveListeners.delete(fn); };
  }

  private setSave(s: SaveState) {
    this.saveState = s;
    this.saveListeners.forEach((fn) => fn(s));
  }

  /** Mutate a draft; pushes an undo snapshot first unless disabled. */
  update(mut: (draft: AppState) => void, opts: { undo?: boolean } = {}): void {
    const snapshot = structuredClone(this.state);
    const draft = structuredClone(this.state);
    mut(draft);
    draft.updatedAt = nowIso();
    if (opts.undo !== false) {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.state = draft;
    this.persist();
    this.listeners.forEach((fn) => fn(this.state));
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.state = prev;
    this.persist();
    this.listeners.forEach((fn) => fn(this.state));
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  private persist(): void {
    this.setSave('saving');
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
      this.setSave('saved');
    } catch {
      // Quota or privacy mode: keep working in memory, say so honestly.
      this.setSave('error');
    }
  }

  /** Morning rollover: renew completed repeating tasks once per day.
      Dry-runs first so quiet days leave no undo entry. Returns renewals. */
  rollover(): number {
    const probe = structuredClone(this.state);
    const today = todayKey();
    if (rolloverRepeats(probe, today) === 0) return 0;
    let n = 0;
    this.update((d) => { n = rolloverRepeats(d, today); });
    return n;
  }

  /** Destructive reset back to labeled samples. Used only from explicit UI. */
  resetToSamples(): void {
    this.update((d) => {
      Object.assign(d, seedState());
    });
  }
}

export const store = new Store();
