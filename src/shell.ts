// App shell: top bar, Room/List navigation, bottom-sheet/side-panel host,
// global search, Add menu, toasts, and the small Clatter panel.

import { store } from './store.js';
import { playMotif, playSoundtrack, configureSound } from './audio.js';
import { player } from './music.js';
import { summarizeChecklist, todayKey } from './core/model.js';
import { searchBelongings } from './core/inference.js';
import { liveBadge, liveStatus } from './core/liveModel.js';
import { dueReminders, markNotified, notifiedIds, remindersEnabled } from './notify.js';
import { listenOnce, voiceInputSupported } from './voice.js';
import { renderRoom, nextCommitment, POSTER_OPTIONS, WALL_OPTIONS, type Area } from './views/room.js';
import { renderTaskDock, renderMusicPlayer } from './docks.js';
import { openAssistant } from './views/assistant.js';
import { openKeys } from './views/setup.js';
import { renderDesk } from './views/areas/desk.js';
import { renderDoorway } from './views/areas/doorway.js';
import { renderWardrobe } from './views/areas/wardrobe.js';
import { renderStorage } from './views/areas/storage.js';
import { renderTimeline } from './views/areas/timeline.js';
import type { AppState } from './core/types.js';

export interface Ui {
  toast: (msg: string, opts?: { action?: string; onAction?: () => void }) => void;
  close: () => void;
  open: (area: Area, opts?: { focusAdd?: boolean }) => void;
  /** Open the central AI setup sheet (keys, backend, Live status). */
  setup: () => void;
  sound: (m: 'desk' | 'doorway' | 'wardrobe' | 'shelf' | 'window' | 'done' | 'pack') => void;
}

type View = 'room' | 'list';

const TITLES: Record<Area, string> = {
  desk: 'Desk — saved intentions',
  doorway: 'Doorway — leaving prep',
  wardrobe: 'Wardrobe — today’s clothes',
  storage: 'Drawers & shelves',
  timeline: 'Window — your day',
  clatter: 'Clatter — optional sound',
  decor: 'Decorate — make the wall yours',
};

export class Shell {
  private topbar = document.getElementById('topbar')!;
  private stage = document.getElementById('stage')!;
  private taskDock = document.getElementById('task-dock');
  private musicPlayer = document.getElementById('music-player');
  private tasksOpen = true;
  private sheetRoot = document.getElementById('sheet-root')!;
  private toastRoot = document.getElementById('toast-root')!;
  private view: View = 'room';
  private late = false;
  ui: Ui;

  constructor() {
    this.ui = {
      toast: (msg, opts) => this.toast(msg, opts),
      close: () => this.closeSheet(),
      open: (area, opts) => this.openSheet(area, opts),
      setup: () => openKeys(this.sheetRoot, this.ui),
      sound: (m) => playMotif(m),
    };
    store.subscribe(() => this.render());
    store.onSaveState(() => this.renderTopbar());
  }

  start(): void {
    configureSound(store.state.sound);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sheetRoot.innerHTML) this.closeSheet();
    });
    const renewed = store.rollover();
    this.render();
    if (renewed > 0) {
      this.toast(`${renewed} routine task${renewed === 1 ? '' : 's'} renewed for today.`, {
        action: 'Undo', onAction: () => store.undo(),
      });
    }
    window.setTimeout(() => this.checkReminders(), 5000);
    window.setInterval(() => this.checkReminders(), 60000);
  }

  /** Fire due local reminders once each. Silent unless opted in + granted. */
  private checkReminders(): void {
    if (!remindersEnabled() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = Date.now();
    const today = todayKey();
    const seen = notifiedIds(today);
    const fresh = dueReminders(store.state, now).filter((r) => !seen.has(r.id));
    if (!fresh.length) return;
    for (const r of fresh) {
      try {
        new Notification(r.title, { body: r.body, tag: r.id });
      } catch { /* a toast still lands below */ }
      this.toast(`${r.title} — ${r.body}`);
    }
    markNotified(today, fresh.map((r) => r.id));
  }

  private render(): void {
    configureSound(store.state.sound);
    this.renderTopbar();
    this.renderStage();
    this.renderTasks();
    renderMusicPlayer(this.musicPlayer);
  }

  /** Bottom-left dock: today's open tasks, with a little show/hide button. */
  private renderTasks(): void {
    renderTaskDock(this.taskDock, store.state, {
      open: this.tasksOpen,
      onToggle: () => { this.tasksOpen = !this.tasksOpen; this.renderTasks(); },
      onDone: (id) => {
        store.update((d) => {
          const t = d.tasks.find((x) => x.id === id);
          if (t) { t.done = true; t.updatedAt = new Date().toISOString(); }
        });
        playMotif('done');
        this.toast('Task done. Nice.');
      },
    });
  }

  // ---------- top bar ----------
  private renderTopbar(): void {
    const s = store.state;
    const next = nextCommitment(s);
    const { packed, total } = summarizeChecklist(s.checklist);
    const saveDot = store.saveState === 'saved' ? '●' : store.saveState === 'saving' ? '◌' : '⚠';
    const saveTitle = store.saveState === 'saved' ? 'All changes saved' : store.saveState === 'saving' ? 'Saving…' : 'Could not save to this browser — working in memory';
    const doneToday = s.tasks.filter((t) => t.done && t.updatedAt.slice(0, 10) === todayKey()).length;
    const inbox = s.captures.filter((c) => c.status === 'inbox').length;
    const ready = total > 0 && packed >= total;
    const mStatus = liveStatus();
    const mBadge = liveBadge();
    this.topbar.innerHTML = `
      <div class="rail rail-left">
        <div class="brand">Pocketroom<small>today, in one little place</small></div>
        <div class="view-switch" role="group" aria-label="View">
          <button data-view="room" aria-pressed="${this.view === 'room'}">Room</button>
          <button data-view="list" aria-pressed="${this.view === 'list'}">List</button>
        </div>
        ${next ? `<span class="chip" title="Next commitment">↗ ${esc(next)}</span>` : `<span class="chip">No more events today</span>`}
        ${total > 0 ? `<button class="chip ${packed < total ? 'warn' : ''}" data-act="door">${packed}/${total} packed</button>` : ''}
        ${inbox > 0 ? `<button class="chip terra" data-act="desk">📝 ${inbox} new on desk</button>` : ''}
        ${ready ? `<span class="chip">✓ All packed — ready</span>` : ''}
        <p class="rail-note hide-late">Your room, at a glance.<br/>Tap the desk to capture, the window for your day, the doorway before leaving — or use List.</p>
      </div>
      <div class="rail rail-right">
        <button class="btn rail-add" data-act="add">+ Add</button>
        <div class="rail-icons">
          <button class="icon-btn" data-act="search" aria-label="Search everything" title="Search">⌕</button>
          <button class="icon-btn ${s.sound.enabled && !s.sound.muted ? 'on' : ''}" data-act="sound" aria-label="Sound settings" title="Sound">♪</button>
          <button class="icon-btn" data-act="undo" aria-label="Undo last change" title="Undo" ${store.canUndo ? '' : 'disabled'}>↩</button>
        </div>
        ${doneToday > 0 ? `<span class="chip" title="Tasks completed today">✓ ${doneToday} done today</span>` : ''}
        <button class="chip ${mStatus === 'live' || mStatus === 'direct' ? '' : 'warn'}" data-act="keys" title="Meta model path — tap for AI setup">${esc(mBadge)}</button>
        ${voiceInputSupported() ? `<button class="btn soft small rail-wide" data-act="assistant">🎙️ Voice assistant</button>` : ''}
        <button class="btn soft small rail-wide" data-act="decor">🎨 Decorate wall</button>
        <span class="chip hide-late" title="${saveTitle}">${saveDot} ${store.saveState}</span>
        <p class="rail-note hide-late">${mStatus === 'demo' ? 'Everything stays on this device.' : 'Live Muse reads transcripts you send; nothing saves without your tap.'}</p>
      </div>`;
    this.topbar.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => { this.view = b.dataset.view as View; this.render(); }));
    this.topbar.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => this.action(b.dataset.act!)));
  }

  private action(act: string): void {
    if (act === 'add') this.openAdd();
    else if (act === 'assistant') openAssistant(this.sheetRoot, this.ui);
    else if (act === 'keys') openKeys(this.sheetRoot, this.ui);
    else if (act === 'desk') this.openSheet('desk');
    else if (act === 'decor') this.openSheet('decor');
    else if (act === 'search') this.openSearch();
    else if (act === 'sound') this.openSheet('clatter');
    else if (act === 'door') this.openSheet('doorway');
    else if (act === 'undo') {
      if (store.undo()) this.toast('Undone.');
      else this.toast('Nothing to undo.');
    }
  }

  // ---------- stage ----------
  private renderStage(): void {
    if (this.late) return this.renderLate();
    if (this.view === 'room') {
      // The wall speakers drive the same player the dock card shows, so the
      // two can never disagree. Sound settings stay behind the ♪ button.
      renderRoom(this.stage, store.state, (area) => {
        if (area === 'clatter') this.toggleRoomMusic();
        else this.openSheet(area);
      });
    } else {
      this.renderList(this.stage, store.state);
    }
  }

  /** One tap on either speaker: play/pause the shared queue. */
  private toggleRoomMusic(): void {
    player.toggle();
    if (player.playing) this.toast(`Playing ${esc(player.track.title)} — controls bottom-right.`);
    else this.toast('Music paused.');
  }

  private renderList(el: HTMLElement, s: AppState): void {
    const today = todayKey();
    const events = s.events.filter((e) => e.date === today).sort((a, b) => a.start.localeCompare(b.start));
    const open = s.tasks.filter((t) => !t.done);
    const { packed, total } = summarizeChecklist(s.checklist);
    const avail = s.clothing.filter((c) => c.state === 'available').length;
    const inbox = s.captures.filter((c) => c.status === 'inbox').length;
    el.innerHTML = `
      <div class="section"><h2>Next up</h2>
        ${events.length ? events.map((e) => `
          <div class="card"><div class="row"><div class="grow">
            <h3>${esc(e.title)}</h3>
            <div class="meta">${e.start}${e.end ? '–' + e.end : ''}${e.place ? ' · ' + esc(e.place) : ''}</div>
          </div><button class="btn soft small" data-open="timeline">Day</button></div></div>`).join('')
          : `<div class="card"><div class="meta">Nothing scheduled today. Capture a screenshot on the desk or add an event.</div></div>`}
      </div>
      <div class="section"><h2>To do <span class="pill">${open.length} open</span></h2>
        ${open.slice(0, 5).map((t) => `
          <div class="card"><div class="row"><div class="grow"><h3>${esc(t.title)}</h3>
          <div class="meta">${t.start ? 'Scheduled ' + esc(t.start.slice(11, 16)) : 'Unscheduled'} · ${t.durationMin} min</div></div>
          <button class="btn soft small" data-done="${t.id}">Done</button></div></div>`).join('') || `<div class="card"><div class="meta">All clear.</div></div>`}
      </div>
      <div class="section"><h2>Leaving <span class="pill ${packed < total ? 'butter' : ''}">${packed}/${total} packed</span></h2>
        <div class="card"><div class="row"><div class="grow"><div class="meta">Checklist, routines, and “running late” mode.</div></div>
        <button class="btn soft small" data-open="doorway">Open</button></div></div>
      </div>
      <div class="section"><h2>More</h2><div class="card"><div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn soft small" data-open="desk">Desk${inbox ? ` (${inbox})` : ''}</button>
        <button class="btn soft small" data-open="wardrobe">Wardrobe (${avail})</button>
        <button class="btn soft small" data-open="storage">Stored items (${s.belongings.length})</button>
        <button class="btn soft small" data-open="timeline">Timeline</button>
      </div></div></div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => this.openSheet(b.dataset.open as Area)));
    el.querySelectorAll<HTMLButtonElement>('[data-done]').forEach((b) =>
      b.addEventListener('click', () => {
        store.update((d) => {
          const t = d.tasks.find((x) => x.id === b.dataset.done);
          if (t) { t.done = true; t.updatedAt = new Date().toISOString(); }
        });
        playMotif('done');
        this.toast('Task done. Nice.');
      }));
  }

  private renderLate(): void {
    const s = store.state;
    const needed = s.checklist.filter((c) => c.state === 'needed' || c.state === 'unresolved');
    const next = nextCommitment(s);
    this.stage.innerHTML = `
      <div class="late-banner">Running late — essentials only. ${next ? 'Next: ' + esc(next) + '.' : ''}</div>
      ${needed.length ? needed.map((c) => `
        <div class="card"><div class="row"><div class="grow"><h3>${esc(c.label)}</h3>
        ${c.belongingId ? `<div class="loc-note">${esc(lastStored(s, c.belongingId))}</div>` : ''}</div>
        <button class="btn small" data-pack="${c.id}">Packed</button></div></div>`).join('')
        : `<div class="card"><h3>Everything essential is packed.</h3><div class="meta">Go — you’ve got this.</div></div>`}
      <button class="btn plain small" data-act="calm" style="margin-top:6px">Back to full room</button>`;
    this.stage.querySelector('[data-act="calm"]')!.addEventListener('click', () => this.setLate(false));
    this.stage.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach((b) =>
      b.addEventListener('click', () => {
        store.update((d) => {
          const it = d.checklist.find((x) => x.id === b.dataset.pack);
          if (it) it.state = 'packed';
        });
        playMotif('pack');
      }));
  }

  setLate(late: boolean): void {
    this.late = late;
    document.body.classList.toggle('late', late);
    this.renderStage();
  }

  // ---------- sheets ----------
  openSheet(area: Area, opts: { focusAdd?: boolean } = {}): void {
    document.body.classList.add('sheet-open');
    const body = document.createElement('div');
    body.className = 'sheet-body';
    if (area === 'desk') renderDesk(body, this.ui, opts);
    else if (area === 'doorway') renderDoorway(body, this.ui, this);
    else if (area === 'wardrobe') renderWardrobe(body, this.ui, opts);
    else if (area === 'storage') renderStorage(body, this.ui, opts);
    else if (area === 'timeline') renderTimeline(body, this.ui, opts);
    else if (area === 'decor') this.renderDecorPanel(body);
    else this.renderSoundPanel(body);

    this.sheetRoot.innerHTML = `
      <div class="sheet-scrim" data-close="1"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${TITLES[area]}">
        <div class="sheet-head"><h2>${TITLES[area]}</h2>
        <button class="btn soft small" data-close="1">← Back</button></div>
      </div>`;
    this.sheetRoot.querySelector('.sheet')!.appendChild(body);
    this.sheetRoot.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeSheet()));
    (this.sheetRoot.querySelector('.sheet-head button') as HTMLButtonElement).focus();
  }

  private closeSheet(): void {
    this.sheetRoot.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }

  // ---------- add / search ----------
  private openAdd(): void {
    document.body.classList.add('sheet-open');
    this.sheetRoot.innerHTML = `
      <div class="sheet-scrim" data-close="1"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Add something">
        <div class="sheet-head"><h2>Add</h2><button class="btn soft small" data-close="1">← Back</button></div>
        <div class="sheet-body"><ul class="clean">
          <li><button class="btn plain" data-go="desk" style="width:100%">📝 Note or screenshot <span class="pill" style="margin-left:6px">desk figures it out</span></button></li>
          <li><div class="row" style="flex-wrap:wrap;gap:8px">
            <button class="btn soft small" data-go="timeline">Event / task</button>
            <button class="btn soft small" data-go="storage">Stored item</button>
            <button class="btn soft small" data-go="wardrobe">Clothing</button>
            <button class="btn soft small" data-go="doorway">Outing checklist</button>
          </div></li>
        </ul></div>
      </div>`;
    this.sheetRoot.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeSheet()));
    this.sheetRoot.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => this.openSheet(b.dataset.go as Area, { focusAdd: true })));
  }

  private openSearch(): void {
    document.body.classList.add('sheet-open');
    this.sheetRoot.innerHTML = `
      <div class="sheet-scrim" data-close="1"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Search">
        <div class="sheet-head"><h2>Search</h2><button class="btn soft small" data-close="1">← Back</button></div>
        <div class="sheet-body search-wrap">
          <div class="row" style="align-items:flex-end">
            <label class="field" style="flex:1">Find anything<input type="text" id="q" placeholder="“Where did I put the adapter?”" autocomplete="off" /></label>
            ${voiceInputSupported() ? `<button class="mic-btn" id="q-mic" aria-label="Search by voice" title="Search by voice">🎙️</button>` : ''}
          </div>
          <div id="results"><p class="meta">Search covers stored items, tasks, events, and clothes.</p></div>
        </div>
      </div>`;
    this.sheetRoot.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeSheet()));
    const q = this.sheetRoot.querySelector<HTMLInputElement>('#q')!;
    const results = this.sheetRoot.querySelector('#results')!;
    q.focus();
    const mic = this.sheetRoot.querySelector<HTMLButtonElement>('#q-mic');
    mic?.addEventListener('click', async () => {
      mic.classList.add('listening'); mic.textContent = '⏺️';
      const heard = await listenOnce({});
      mic.classList.remove('listening'); mic.textContent = '🎙️';
      if (heard) { q.value = heard; q.dispatchEvent(new Event('input')); }
      else this.toast('Did not catch that — try typing instead.');
    });
    q.addEventListener('input', () => {
      const s = store.state;
      const query = q.value.trim();
      if (query.length < 2) {
        results.innerHTML = `<p class="meta">Type at least 2 characters.</p>`;
        return;
      }
      const hits = searchBelongings(query, s.belongings, s.locations).slice(0, 4);
      const ql = query.toLowerCase();
      const tasks = s.tasks.filter((t) => t.title.toLowerCase().includes(ql)).slice(0, 3);
      const events = s.events.filter((e) => e.title.toLowerCase().includes(ql)).slice(0, 3);
      const clothes = s.clothing.filter((c) => c.name.toLowerCase().includes(ql)).slice(0, 3);
      results.innerHTML =
        (hits.length ? `<h3>Stored items</h3><ul class="clean">${hits.map((h) => `
          <li><strong>${esc(h.belonging.name)}</strong><br/><span class="loc-note">${esc(lastStored(s, h.belonging.id))}</span></li>`).join('')}</ul>` : '') +
        (tasks.length ? `<h3>Tasks</h3><ul class="clean">${tasks.map((t) => `<li>${esc(t.title)}</li>`).join('')}</ul>` : '') +
        (events.length ? `<h3>Events</h3><ul class="clean">${events.map((e) => `<li>${esc(e.title)} · ${e.date} ${e.start}</li>`).join('')}</ul>` : '') +
        (clothes.length ? `<h3>Clothes</h3><ul class="clean">${clothes.map((c) => `<li>${esc(c.name)} (${c.state})</li>`).join('')}</ul>` : '') +
        (!hits.length && !tasks.length && !events.length && !clothes.length ? `<p>No matches. Try fewer words, e.g. “adapter”.</p>` : '');
    });
  }

  // ---------- decor panel ----------
  private renderDecorPanel(body: HTMLElement): void {
    const decor = store.state.decor ?? { wall: 'ivory' as const, poster: 'sunset' as const };
    const wallHex: Record<string, string> = { ivory: '#efe4cf', sage: '#dfe8d6', butter: '#f6e7b4', sky: '#d2e3ec', blush: '#f1d6c6' };
    body.innerHTML = `
      <p class="meta">Make the room yours. Changes save on this device and show instantly in the room.</p>
      <h3>Wall colour</h3>
      <div class="decor-grid" role="group" aria-label="Wall colour">
        ${WALL_OPTIONS.map((w) => `<button class="swatch" data-wall="${w}" style="background:${wallHex[w]}" aria-pressed="${decor.wall === w}" aria-label="${w} wall" title="${w}"></button>`).join('')}
      </div>
      <h3>Poster</h3>
      <div class="decor-grid" role="group" aria-label="Poster">
        ${POSTER_OPTIONS.map((p) => `<button class="btn ${decor.poster === p.id ? 'plain' : 'soft'} small" data-poster="${p.id}" aria-pressed="${decor.poster === p.id}">${p.label}</button>`).join('')}
      </div>
      <div class="card"><h3>Your own poster</h3>
        ${decor.customPoster ? `<img src="${decor.customPoster}" alt="Your custom poster preview" style="width:100%;aspect-ratio:2.25;object-fit:cover;border-radius:10px;border:6px solid var(--line)" />` : `<p class="meta">Upload any image — it is cropped to the poster frame, shrunk, and kept only on this device.</p>`}
        <p><label class="field">Poster image<input type="file" id="decor-file" accept="image/*" /></label></p>
        ${decor.customPoster ? `<div class="row" style="flex-wrap:wrap;gap:8px">
          <button class="btn ${decor.poster === 'custom' ? 'plain' : 'soft'} small" id="decor-use">Use my poster</button>
          <button class="btn danger small" id="decor-remove">Remove</button></div>` : ''}
      </div>
      <p class="meta">Tip: tap the poster in the room any time to come back here.</p>`;
    body.querySelectorAll<HTMLButtonElement>('[data-wall]').forEach((b) =>
      b.addEventListener('click', () => {
        const wall = b.dataset.wall as typeof decor.wall;
        store.update((d) => { d.decor = { wall, poster: d.decor?.poster ?? 'sunset', customPoster: d.decor?.customPoster }; }, { undo: false });
        this.openSheet('decor');
      }));
    body.querySelectorAll<HTMLButtonElement>('[data-poster]').forEach((b) =>
      b.addEventListener('click', () => {
        const poster = b.dataset.poster as typeof decor.poster;
        store.update((d) => { d.decor = { wall: d.decor?.wall ?? 'ivory', poster, customPoster: d.decor?.customPoster }; }, { undo: false });
        this.openSheet('decor');
      }));
    body.querySelector<HTMLInputElement>('#decor-file')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { this.toast('That file is not an image.'); return; }
      if (file.size > 8 * 1024 * 1024) { this.toast('That image is too large (over 8 MB).'); return; }
      try {
        const dataUrl = await readPosterImage(file);
        store.update((d) => { d.decor = { wall: d.decor?.wall ?? 'ivory', poster: 'custom', customPoster: dataUrl }; }, { undo: false });
        this.toast('Your poster is on the wall.');
        this.openSheet('decor');
      } catch {
        this.toast('Could not read that image.');
      }
    });
    body.querySelector('#decor-use')?.addEventListener('click', () => {
      store.update((d) => { if (d.decor) d.decor.poster = 'custom'; }, { undo: false });
      this.openSheet('decor');
    });
    body.querySelector('#decor-remove')?.addEventListener('click', () => {
      store.update((d) => {
        if (!d.decor) return;
        d.decor.customPoster = undefined;
        if (d.decor.poster === 'custom') d.decor.poster = 'sunset';
      }, { undo: false });
      this.toast('Custom poster removed.');
      this.openSheet('decor');
    });
  }

  // ---------- clatter panel ----------
  private renderSoundPanel(body: HTMLElement): void {
    const s = store.state.sound;
    const areas: ('desk' | 'doorway' | 'wardrobe' | 'shelf' | 'window')[] = ['desk', 'doorway', 'wardrobe', 'shelf', 'window'];
    const uploads = player.custom;
    body.innerHTML = `
      <p class="meta">Clatter adds small local sounds to useful moments. Off by default, always mutable, never required.</p>
      <div class="card"><div class="row"><div class="grow"><h3>Room sounds</h3>
        <div class="meta">Precomposed motifs, played on this device. No recording, no network.</div></div>
        <button class="btn ${s.enabled ? 'plain' : 'soft'} small" data-snd="toggle">${s.enabled ? 'On' : 'Off'}</button></div></div>
      <div class="card"><div class="row"><div class="grow"><h3>My music</h3>
        <div class="meta">Your own audio files, kept in this browser. They play through the record player.</div></div>
        <button class="btn soft small" data-up="pick">⤒ Upload</button>
        <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm" multiple hidden data-up-input /></div>
        ${uploads.length ? `<ul class="upload-list">${uploads.map((u, i) => `
          <li>
            <button class="btn ${player.track.key === u.id && player.playing ? 'plain' : 'soft'} small" data-up-play="${i}">${player.track.key === u.id && player.playing ? '⏸' : '▶'}</button>
            <span class="upload-name">${esc(u.title)}</span>
            <button class="btn plain small" data-up-del="${esc(u.id)}" aria-label="Remove upload ${esc(u.title)}" title="Remove">✕</button>
          </li>`).join('')}</ul>`
          : `<p class="meta">Nothing uploaded yet.</p>`}
        ${player.notice ? `<p class="music-note">${esc(player.notice)}</p>` : ''}</div>
      <div class="card"><div class="row"><div class="grow"><h3>Mute everything</h3></div>
        <button class="btn soft small" data-snd="mute">${s.muted ? 'Unmute' : 'Mute'}</button></div></div>
      <div class="card"><h3>Today’s soundtrack</h3>
        <div class="meta">A short phrase per room area. Silent while muted.</div>
        <p><button class="btn soft small" data-snd="play">▶ Replay soundtrack</button></p>
        <div class="row" style="flex-wrap:wrap;gap:8px">${areas.map((a) => `<button class="btn soft small" data-motif="${a}">${a}</button>`).join('')}</div></div>`;
    body.querySelectorAll<HTMLButtonElement>('[data-snd]').forEach((b) =>
      b.addEventListener('click', () => {
        const act = b.dataset.snd!;
        if (act === 'toggle') store.update((d) => { d.sound.enabled = !d.sound.enabled; }, { undo: false });
        else if (act === 'mute') store.update((d) => { d.sound.muted = !d.sound.muted; }, { undo: false });
        else if (act === 'play') { player.pause(); playSoundtrack(areas); }
        this.openSheet('clatter');
      }));
    body.querySelectorAll<HTMLButtonElement>('[data-motif]').forEach((b) =>
      b.addEventListener('click', () => playMotif(b.dataset.motif as 'desk')));
    const upInput = body.querySelector<HTMLInputElement>('[data-up-input]');
    body.querySelector<HTMLButtonElement>('[data-up="pick"]')?.addEventListener('click', () => upInput?.click());
    upInput?.addEventListener('change', () => {
      const files = [...(upInput.files ?? [])];
      upInput.value = '';
      if (!files.length) return;
      void files.reduce((p, f) => p.then(() => player.addUpload(f)), Promise.resolve())
        .then(() => this.openSheet('clatter'));
    });
    body.querySelectorAll<HTMLButtonElement>('[data-up-play]').forEach((b) =>
      b.addEventListener('click', () => {
        const at = Number(b.dataset.upPlay);
        const id = player.custom[at]?.id;
        if (!id) return;
        if (player.track.key === id && player.playing) player.pause();
        else player.play(at); // uploads sit first in the queue, so index == position
        this.openSheet('clatter');
      }));
    body.querySelectorAll<HTMLButtonElement>('[data-up-del]').forEach((b) =>
      b.addEventListener('click', () => {
        void player.removeUpload(b.dataset.upDel!).then(() => this.openSheet('clatter'));
      }));
  }

  // ---------- toast ----------
  toast(msg: string, opts: { action?: string; onAction?: () => void } = {}): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ''}`;
    if (opts.action) t.querySelector('button')!.addEventListener('click', () => { opts.onAction?.(); t.remove(); });
    this.toastRoot.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
}

/** “Last recorded in X · date” — never claims a live location. */
export function lastStored(s: AppState, belongingId: string): string {
  const b = s.belongings.find((x) => x.id === belongingId);
  if (!b) return 'Unknown item';
  const loc = b.locationId ? s.locations.find((l) => l.id === b.locationId) : undefined;
  const last = b.history[b.history.length - 1];
  const when = last ? new Date(last.at).toLocaleDateString() : null;
  if (!loc) return 'No confirmed location yet';
  return `Last recorded in ${loc.name}${when ? ' · ' + when : ''}`;
}

/** Crop an upload to the poster's 2.25:1 frame and shrink it for local storage. */
function readPosterImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const W = 432, H = 192, target = W / H;
        const srcRatio = img.width / img.height;
        const sw = srcRatio > target ? img.height * target : img.width;
        const sh = srcRatio > target ? img.height : img.width / target;
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
