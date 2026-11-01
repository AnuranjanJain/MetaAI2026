// Bottom docks: today's tasks (bottom-left) and the record player
// (bottom-right). Both are separate cards, detached from the top rails.
// Playback state lives in music.ts, so re-rendering these never restarts audio.

import { player } from './music.js';
import type { AppState } from './core/types.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- tasks dock (bottom-left) ----------

export interface TaskDockOpts {
  open: boolean;
  onToggle: () => void;
  onDone: (id: string) => void;
}

export function renderTaskDock(el: HTMLElement | null, state: AppState, opts: TaskDockOpts): void {
  if (!el) return;
  const open = state.tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
  const shown = open.slice(0, 6);
  el.innerHTML = `
    <div class="task-dock-card">
      <div class="dock-head">
        <h2>Today's tasks</h2>
        <span class="pill ${open.length ? 'butter' : ''}">${open.length} open</span>
        <button class="dock-toggle ${opts.open ? '' : 'closed'}" data-tasks-toggle aria-expanded="${opts.open}"
          aria-label="${opts.open ? 'Hide tasks' : 'Show tasks'}" title="${opts.open ? 'Hide tasks' : 'Show tasks'}"><svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><polyline points="4,7 10,13 16,7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      ${opts.open ? (shown.length ? `<ul class="task-list">${shown.map((t) => `
        <li>
          <button class="task-check" data-done-task="${t.id}" aria-label="Mark “${esc(t.title)}” done" title="Mark done">✓</button>
          <span class="task-text">${esc(t.title)}<small>${t.start ? esc(t.start.slice(11, 16)) : 'Any time'} · ${t.durationMin} min</small></span>
        </li>`).join('')}</ul>
        ${open.length > shown.length ? `<p class="dock-more">+ ${open.length - shown.length} more — see List</p>` : ''}`
        : `<p class="dock-empty">All clear. Nothing left to do today. 🎉</p>`) : ''}
    </div>`;
  el.querySelector('[data-tasks-toggle]')?.addEventListener('click', opts.onToggle);
  el.querySelectorAll<HTMLButtonElement>('[data-done-task]').forEach((b) =>
    b.addEventListener('click', () => opts.onDone(b.dataset.doneTask!)));
}

// ---------- record player (bottom, separate from the top) ----------

let musicRoot: HTMLElement | null = null;
let subscribed = false;

export function renderMusicPlayer(el: HTMLElement | null): void {
  if (!el) return;
  musicRoot = el;
  if (!subscribed) { player.onChange(updateMusicUi); subscribed = true; }
  el.innerHTML = `
    <div class="player-card" data-player-card>
      <div class="player-top">
        <div class="vinyl-wrap" aria-hidden="true">
          <div class="vinyl"></div>
          <div class="tonearm"><span class="tonearm-head"></span></div>
        </div>
        <div class="player-info">
          <div class="player-kicker" data-music-kicker>Now playing</div>
          <div class="track-title" data-music-title></div>
          <div class="track-artist" data-music-artist></div>
        </div>
      </div>
      <div class="progress music-progress"><span data-music-bar></span></div>
      <div class="player-controls">
        <button class="icon-btn" data-music="prev" aria-label="Previous track" title="Previous track">⏮</button>
        <button class="icon-btn on" data-music="toggle" data-music-toggle aria-label="Play or pause" title="Play / pause">▶</button>
        <button class="icon-btn" data-music="next" aria-label="Next track" title="Next track">⏭</button>
        <button class="icon-btn fav-btn" data-music="fav" data-music-fav aria-label="Favourite this track" title="Favourite">♥</button>
      </div>
      <div class="player-sub">
        <label class="icon-btn upload-label" title="Upload my own music (kept in this browser)">
          ⤒ <span>My music</span>
          <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm" multiple hidden data-music-upload />
        </label>
        <button class="icon-btn" data-music="remove" data-music-remove title="Remove this upload">✕</button>
      </div>
      <p class="music-note" data-music-note hidden></p>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.music === 'toggle') player.toggle();
      else if (b.dataset.music === 'next') player.next();
      else if (b.dataset.music === 'prev') player.prev();
      else if (b.dataset.music === 'fav') player.toggleFavorite();
      else if (b.dataset.music === 'remove') void player.removeCurrentUpload();
    }));
  el.querySelector<HTMLInputElement>('[data-music-upload]')?.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    // Queue uploads in order; the first one starts playing.
    void files.reduce((p, f) => p.then(() => player.addUpload(f)), Promise.resolve());
  });
  updateMusicUi();
}

/** Refresh only the player DOM — called on every playback tick. */
function updateMusicUi(): void {
  const root = musicRoot;
  if (!root) return;
  const t = player.track;
  root.querySelector('[data-player-card]')?.classList.toggle('playing', player.playing);
  const kicker = root.querySelector('[data-music-kicker]');
  if (kicker) kicker.textContent = t.custom ? 'My music' : 'Now playing';
  const title = root.querySelector('[data-music-title]');
  if (title) title.textContent = t.title;
  const artist = root.querySelector('[data-music-artist]');
  if (artist) artist.textContent = t.custom ? 'your upload' : `${t.artist} · ${t.mood}`;
  const toggle = root.querySelector('[data-music-toggle]');
  if (toggle) toggle.textContent = player.playing ? '⏸' : '▶';
  const bar = root.querySelector<HTMLElement>('[data-music-bar]');
  if (bar) bar.style.width = `${Math.round(player.progress() * 100)}%`;
  const fav = root.querySelector<HTMLElement>('[data-music-fav]');
  if (fav) {
    fav.classList.toggle('fav-on', player.isFavorite());
    fav.setAttribute('aria-pressed', String(player.isFavorite()));
  }
  const remove = root.querySelector<HTMLElement>('[data-music-remove]');
  if (remove) {
    remove.style.display = player.isCustom() ? '' : 'none';
    remove.setAttribute('aria-label', `Remove upload “${t.title}”`);
  }
  const note = root.querySelector<HTMLElement>('[data-music-note]');
  if (note) {
    note.hidden = !player.notice;
    note.textContent = player.notice;
  }
}
