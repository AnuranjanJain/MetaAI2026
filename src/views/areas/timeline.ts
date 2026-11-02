// Window into the day: fixed events, scheduled + unscheduled flexible tasks,
// accessible scheduling controls, and reviewed schedule revisions.

import { store } from '../../store.js';
import { addDaysKey, buildChecklistForEvent, bumpStreak, createId, demoDayState, nowIso, todayKey } from '../../core/model.js';
import { captainContext, heuristicCaptain, verifyCaptainPlan, type CaptainPlan } from '../../core/captain.js';
import { DEMO_LABEL } from '../../core/inference.js';
import { liveStatus } from '../../core/liveModel.js';
import { resolveCaptain } from '../../core/liveModel.js';
import { MUSE_MODEL, shortModel } from '../../core/muse.js';
import { detectConflicts, freeWindows, overdueTasks, toMinutes } from '../../core/schedule.js';
import { remindersEnabled, setReminders } from '../../notify.js';
import { buildDayPlan, type DayPlan } from '../../core/planner.js';
import type { CalEvent, Id, Task } from '../../core/types.js';
import { esc, noteHtml, type Ui } from '../../shell.js';
import { speak, voiceOutputSupported } from '../../voice.js';
import { renderShare } from '../share.js';

let day = todayKey();
let pendingPlan: DayPlan | null = null;
let pendingCaptain: { plan: CaptainPlan; live: boolean; direct: boolean; model: string | null; latencyMs: number } | null = null;

export function renderTimeline(body: HTMLElement, ui: Ui, opts: { focusAdd?: boolean }): void {
  const s = store.state;
  const events = s.events.filter((e) => e.date === day).sort((a, b) => a.start.localeCompare(b.start));
  const scheduled = s.tasks.filter((t) => !t.done && t.start?.slice(0, 10) === day)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const unscheduled = s.tasks.filter((t) => !t.done && !t.start);
  const conflicts = detectConflicts(s.events, day);
  const windows = freeWindows(s.events, day);
  const overdue = overdueTasks(s.tasks, nowIso());
  const doneToday = s.tasks.filter((t) => t.done && t.updatedAt.slice(0, 10) === day);
  const remOn = remindersEnabled();
  const remState = typeof Notification === 'undefined' ? 'unsupported here' : Notification.permission === 'granted' ? (remOn ? 'on' : 'off') : `browser permission: ${Notification.permission}`;
  const mStatus = liveStatus();
  const streakBit = s.streak ? ` Captain streak: ${s.streak.count} day(s).` : '';
  const captainNote = mStatus === 'direct'
    ? noteHtml('live', 'Muse key', `Your key, this browser (${esc(shortModel(MUSE_MODEL))}). Muse proposes, code verifies: fixed events never move, nothing saves until you tap Accept.${streakBit}`)
    : mStatus === 'live'
      ? noteHtml('live', 'Muse on', `Muse proposes (${esc(shortModel(MUSE_MODEL))}), code verifies: fixed events never move, nothing saves until you tap Accept.${streakBit}`)
      : mStatus === 'offline'
        ? noteHtml('demo', 'Offline', `Muse unreachable — on-device Captain fallback, no model call. Nothing saves until you tap Accept.${streakBit}`)
        : noteHtml('demo', 'Demo', `Live is off — on-device Captain, no model call. Nothing saves until you tap Accept.${streakBit}`);

  body.innerHTML = `
    <div class="row day-stepper">
      <button class="btn soft small" data-day="-1">← Prev</button>
      <div class="grow day-label">${day === todayKey() ? 'Today' : 'Day'} · ${esc(day)}</div>
      <button class="btn soft small" data-day="1">Next →</button>
    </div>
    <div class="reminder-row"><span>🔔 Reminders · ${esc(remState)}</span><button class="btn soft small" id="rem-toggle">${remOn ? 'Turn off' : 'Turn on'}</button></div>
    ${conflicts.length ? `<div class="card" style="border-color:var(--danger)"><strong>Scheduling conflicts</strong><ul class="clean">${conflicts.map((c) => `<li class="missing">${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${overdue.length ? `<div class="card" style="border-color:var(--terra)"><strong>Overdue — time passed, not done</strong><ul class="clean">${overdue.slice(0, 8).map((t) => `<li>⏰ ${esc(t.title)} <span class="meta">(was ${esc((t.start ?? '').slice(0, 16).replace('T', ' '))})</span></li>`).join('')}</ul><p><button class="btn soft small" id="over-release">Release all to unscheduled</button></p></div>` : ''}
    <h3>Fixed plans <span class="pill">${events.length}</span></h3>
    ${events.length ? events.map((e) => eventCard(e)).join('') : `<p class="meta">Nothing fixed on this day — the day is yours.</p>`}
    <h3>Scheduled tasks <span class="pill">${scheduled.length}</span></h3>
    ${scheduled.length ? scheduled.map((t) => taskRow(t, true)).join('') : `<p class="meta">No tasks placed yet — Captain below can help.</p>`}
    <h3>Unscheduled <span class="pill ${unscheduled.length ? 'butter' : ''}">${unscheduled.length}</span></h3>
    ${unscheduled.length ? unscheduled.map((t) => taskRow(t, false)).join('') : `<p class="meta">Everything has a time. Calm.</p>`}
    ${windows.length ? `<h3>Open windows</h3><ul class="clean">${windows.map((w) => `<li class="meta">${toHM(w.start)} – ${toHM(w.end)} free</li>`).join('')}</ul>` : ''}
    <div class="card"><h3>Morning Captain — dump, review, accept</h3>
      ${captainNote}
      <label class="field">Morning dump (one per line)<textarea id="cap-dump" rows="3" placeholder="e.g. Read chapter 4&#10;Pack adapter&#10;Call mom, 20 min"></textarea></label>
      <p class="row" style="flex-wrap:wrap;gap:8px"><button class="btn plain small" id="cap-go">Captain my day</button><button class="btn soft small" id="demo-day">Try demo day</button></p>
      <div id="cap-out">${pendingCaptain ? '' : '<p class="meta">No Captain plan yet.</p>'}</div>
    </div>
    <div class="card"><h3>Plan my day</h3>
      ${noteHtml('demo', 'Demo', `${esc(DEMO_LABEL)} for schedule proposals. Fixed events never move; you review every change.`)}
      <div class="row">
        <label class="field">Not before<input type="time" id="rev-lo" value="08:00" /></label>
        <label class="field">Finish by<input type="time" id="rev-hi" value="22:00" /></label>
        <label class="field">Leave buffer
          <select id="plan-buffer"><option value="10">10 min</option><option value="15" selected>15 min</option><option value="30">30 min</option></select>
        </label>
      </div>
      <p class="row" style="flex-wrap:wrap;gap:8px"><button class="btn soft small" id="plan-go">Plan my day</button>
      <button class="btn soft small" id="plan-late">I'm late — replan from now</button></p>
      <div id="rev-out">${pendingPlan ? '' : '<p class="meta">No plan yet.</p>'}</div>
    </div>
    <div class="card"><h3>Share your day</h3><div id="share-out"></div></div>
    <div class="card"><h3>Wrap the day</h3>
      <p class="meta">${doneToday.length} finished · ${scheduled.length} still placed · ${unscheduled.length} unscheduled.${s.streak ? ` Captain streak: ${s.streak.count} day(s).` : ''}</p>
      <p class="row" style="flex-wrap:wrap;gap:8px"><button class="btn soft small" id="wrap-carry">Carry placed tasks to unscheduled</button><button class="btn soft small" id="wrap-next">Preview tomorrow</button></p>
    </div>
    <div class="card"><h3>Add to the day</h3>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn soft small" id="add-event">+ Event</button>
        <button class="btn soft small" id="add-task">+ Flexible task</button>
      </div><div id="add-out" style="margin-top:8px"></div></div>`;

  if (pendingPlan) paintPlan(body, ui);
  if (pendingCaptain) paintCaptain(body, ui);
  const shareHost = body.querySelector<HTMLElement>('#share-out');
  if (shareHost) renderShare(shareHost, ui, day);
  wire(body, ui, events, scheduled, unscheduled, opts);
}

function eventCard(e: CalEvent): string {
  const st = store.state;
  const outfit = e.outfitId ? st.outfits.find((o) => o.id === e.outfitId) : undefined;
  const checks = st.checklist.filter((c) => c.eventId === e.id);
  const packed = checks.filter((c) => c.state === 'packed').length;
  return `<div class="card tl-block fixed"><div class="row"><div class="grow">
    <div class="when">${e.start}${e.end ? '–' + e.end : ''} · fixed</div>
    <h3 class="title">${esc(e.title)}</h3>
    <div class="meta">${e.place ? esc(e.place) + ' · ' : ''}${e.prep ? 'Prep: ' + esc(e.prep) : ''}
    ${outfit ? `<br/>👔 ${esc(outfit.name)}` : ''}${checks.length ? `<br/>🎒 ${packed}/${checks.length} packed` : ''}</div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
      <select data-outfit="${e.id}" aria-label="Attach outfit to ${esc(e.title)}">
        <option value="">Outfit…</option>
        ${st.outfits.map((o) => `<option value="${o.id}" ${o.id === e.outfitId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
      </select>
      <select data-routine="${e.id}" aria-label="Build checklist for ${esc(e.title)}">
        <option value="">Packing list…</option>
        ${st.routines.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
      </select>
      <button class="btn danger small push-right" data-del-event="${e.id}">Delete</button>
    </div></div></div></div>`;
}

function taskRow(t: Task, scheduled: boolean): string {
  return `<div class="card tl-block"><div class="row"><div class="grow">
    <div class="when">${scheduled && t.start ? t.start.slice(11, 16) : 'unscheduled'} · <span class="pill">${t.durationMin} min</span>${t.repeat ? ` <span class="pill butter">🔁 ${t.repeat}</span>` : ''}</div>
    <h3 class="title">${esc(t.title)}</h3>${t.notes ? `<div class="meta">${esc(t.notes)}</div>` : ''}
    ${!scheduled
      ? `<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><input type="time" value="12:00" data-slot="${t.id}" aria-label="Time for ${esc(t.title)}" style="width:auto" />
      <button class="btn soft small" data-place="${t.id}">Place</button><button class="btn plain small push-right" data-done="${t.id}">Done</button></div>`
      : `<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button class="btn soft small push-right" data-unplace="${t.id}">Unschedule</button><button class="btn plain small" data-done="${t.id}">Done</button></div>`}
    </div></div></div>`;
}

function wire(body: HTMLElement, ui: Ui, events: CalEvent[], scheduled: Task[], unscheduled: Task[], opts: { focusAdd?: boolean }): void {
  // "Read my day" lives in the sticky sheet head so it never scrolls away.
  // openSheet attaches the body after render returns, so mount on a
  // microtask — then body.closest('.sheet') resolves. Re-renders remount
  // with a fresh closure, so Prev/Next never leaves it stale.
  if (voiceOutputSupported()) {
    queueMicrotask(() => {
      if (!body.isConnected) return;
      const head = body.closest('.sheet')?.querySelector('.sheet-head');
      const back = head?.querySelector('[data-close]');
      if (!head || !back) return;
      head.querySelector('#day-say')?.remove();
      const b = document.createElement('button');
      b.className = 'btn soft small';
      b.id = 'day-say';
      b.textContent = '🔊 Read my day';
      b.addEventListener('click', () => {
        const label = day === todayKey() ? 'Today' : day;
        const bits: string[] = [];
        if (events.length) bits.push(`${events.length} fixed event${events.length === 1 ? '' : 's'}: ${events.map((e) => `${e.title} at ${e.start}`).join(', ')}`);
        else bits.push('no fixed events');
        bits.push(scheduled.length ? `${scheduled.length} scheduled task${scheduled.length === 1 ? '' : 's'}` : 'no scheduled tasks');
        bits.push(unscheduled.length ? `${unscheduled.length} unscheduled` : 'nothing unscheduled');
        speak(`${label}. ${bits.join('. ')}.`);
      });
      back.before(b);
    });
  }
  body.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
    b.addEventListener('click', () => { day = addDaysKey(day, Number(b.dataset.day)); pendingPlan = null; renderTimeline(body, ui, {}); }));
  body.querySelectorAll<HTMLButtonElement>('[data-done]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => {
        const t = d.tasks.find((x) => x.id === b.dataset.done);
        if (t) { t.done = true; t.updatedAt = nowIso(); }
      });
      ui.sound('done');
      ui.toast('Task done.');
      renderTimeline(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-place]').forEach((b) =>
    b.addEventListener('click', () => {
      const slot = body.querySelector<HTMLInputElement>(`[data-slot="${b.dataset.place}"]`)!;
      if (!slot.value) { ui.toast('Pick a time first.'); return; }
      store.update((d) => {
        const t = d.tasks.find((x) => x.id === b.dataset.place);
        if (t) { t.start = `${day}T${slot.value}:00`; t.updatedAt = nowIso(); }
      });
      ui.sound('window');
      ui.toast('Placed. Drag-free scheduling works too — this control is the accessible path.');
      renderTimeline(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-unplace]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => {
        const t = d.tasks.find((x) => x.id === b.dataset.unplace);
        if (t) { t.start = undefined; t.updatedAt = nowIso(); }
      });
      renderTimeline(body, ui, {});
    }));
  body.querySelectorAll<HTMLSelectElement>('[data-outfit]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const eventId = sel.dataset.outfit!;
      store.update((d) => {
        const e = d.events.find((x) => x.id === eventId);
        if (e) e.outfitId = sel.value || undefined;
      });
      ui.toast(sel.value ? 'Outfit attached to event.' : 'Outfit detached.');
      renderTimeline(body, ui, {});
    }));
  body.querySelectorAll<HTMLSelectElement>('[data-routine]').forEach((sel) =>
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const items = buildChecklistForEvent(store.state, sel.dataset.routine!, sel.value);
      store.update((d) => { d.checklist.push(...items); });
      ui.sound('doorway');
      ui.toast(`Packing list ready: ${items.length} items.`, { action: 'Open doorway', onAction: () => ui.open('doorway') });
      renderTimeline(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-del-event]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => {
        d.events = d.events.filter((x) => x.id !== b.dataset.delEvent);
        d.checklist = d.checklist.filter((x) => x.eventId !== b.dataset.delEvent);
      });
      ui.toast('Event deleted (its packing list went too).', { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } });
      renderTimeline(body, ui, {});
    }));

  body.querySelector('#cap-go')!.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#cap-go')!;
    const dump = body.querySelector<HTMLTextAreaElement>('#cap-dump')!.value;
    const host = body.querySelector('#cap-out')!;
    btn.disabled = true;
    host.innerHTML = '<p class="meta">Captain is reading your day…</p>';
    try {
      const ctx = captainContext(store.state, day, dump);
      const live = await resolveCaptain(ctx);
      if (live) {
        const plan: CaptainPlan = { ...live.plan, trace: [...live.plan.trace, `Verified in code: fixed events never move.`] };
        const verdict = verifyCaptainPlan(plan, store.state, day);
        plan.trace.push(verdict.ok ? 'Code check passed.' : `Code check found ${verdict.errors.length} issue(s) — review below.`);
        pendingCaptain = { plan, live: true, direct: live.direct, model: live.model, latencyMs: live.latencyMs };
      } else {
        const plan = heuristicCaptain(store.state, day, dump);
        plan.trace.unshift('Muse unreachable — local Captain fallback, no model call.');
        pendingCaptain = { plan, live: false, direct: false, model: null, latencyMs: 0 };
      }
      paintCaptain(body, ui);
    } catch (e) {
      console.error('captain failed', e);
      host.innerHTML = '<p class="missing">Captain hiccuped — try again.</p>';
    } finally {
      btn.disabled = false;
    }
  });

  body.querySelector('#demo-day')!.addEventListener('click', () => {
    const st = store.state;
    const livedIn = st.tasks.length > 6 || st.events.length > 3 || st.tasks.some((t) => t.done) || !!st.streak;
    if (livedIn && !window.confirm('Replace your room with the demo day? Your current room stays one Undo away.')) return;
    pendingCaptain = null;
    pendingPlan = null;
    store.update((d) => { Object.assign(d, demoDayState()); });
    ui.toast('Demo day loaded — 3 events, 5 tasks, inbox samples.', { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } });
    renderTimeline(body, ui, {});
  });

  body.querySelector('#rem-toggle')?.addEventListener('click', async () => {
    if (typeof Notification === 'undefined') { ui.toast('Notifications are unsupported in this browser.'); return; }
    if (!remindersEnabled()) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { ui.toast('Reminder permission denied — the room stays quiet.'); return; }
      setReminders(true);
      ui.toast('Reminders on: events 15 min ahead, tasks at their time.');
    } else {
      setReminders(false);
      ui.toast('Reminders off.');
    }
    renderTimeline(body, ui, {});
  });

  body.querySelector('#over-release')?.addEventListener('click', () => {
    const ids = new Set(overdueTasks(store.state.tasks, nowIso()).map((t) => t.id));
    if (!ids.size) return;
    store.update((d) => {
      for (const t of d.tasks) if (ids.has(t.id)) { t.start = undefined; t.updatedAt = nowIso(); }
    });
    ui.toast(`Released ${ids.size} overdue task${ids.size === 1 ? '' : 's'} to unscheduled.`, { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } });
    renderTimeline(body, ui, {});
  });

  body.querySelector('#wrap-carry')?.addEventListener('click', () => {
    const ids = new Set(scheduled.map((t) => t.id));
    if (!ids.size) { ui.toast('Nothing placed — the day is already clear.'); return; }
    store.update((d) => {
      for (const t of d.tasks) if (ids.has(t.id)) { t.start = undefined; t.updatedAt = nowIso(); }
    });
    ui.toast(`Carried ${ids.size} task${ids.size === 1 ? '' : 's'} back to unscheduled.`, { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } });
    renderTimeline(body, ui, {});
  });

  body.querySelector('#wrap-next')?.addEventListener('click', () => {
    day = addDaysKey(day, 1);
    renderTimeline(body, ui, {});
  });

  body.querySelector('#plan-go')!.addEventListener('click', () => {
    const lo = body.querySelector<HTMLInputElement>('#rev-lo')!.value || '08:00';
    const hi = body.querySelector<HTMLInputElement>('#rev-hi')!.value || '22:00';
    const buffer = Number(body.querySelector<HTMLSelectElement>('#plan-buffer')!.value || 15);
    pendingPlan = buildDayPlan(store.state, day, { earliest: lo, latest: hi, leaveBufferMin: buffer });
    paintPlan(body, ui);
  });
  body.querySelector('#plan-late')!.addEventListener('click', () => {
    const hi = body.querySelector<HTMLInputElement>('#rev-hi')!.value || '22:00';
    const buffer = Number(body.querySelector<HTMLSelectElement>('#plan-buffer')!.value || 15);
    const now = new Date();
    const fromMin = day === todayKey() ? now.getHours() * 60 + now.getMinutes() : undefined;
    pendingPlan = buildDayPlan(store.state, day, { fromMin, latest: hi, leaveBufferMin: buffer });
    paintPlan(body, ui);
  });

  body.querySelector('#add-event')!.addEventListener('click', () => {
    const host = body.querySelector('#add-out')!;
    host.innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="ne-title" placeholder="Title" style="flex:2;min-width:140px" />
      <input type="time" id="ne-start" value="12:00" style="width:auto" aria-label="Start" />
      <input type="time" id="ne-end" style="width:auto" aria-label="End" />
      <button class="btn plain small" id="ne-go">Add fixed event</button></div>`;
    host.querySelector('#ne-go')!.addEventListener('click', () => {
      const title = host.querySelector<HTMLInputElement>('#ne-title')!.value.trim();
      const start = host.querySelector<HTMLInputElement>('#ne-start')!.value;
      const end = host.querySelector<HTMLInputElement>('#ne-end')!.value || undefined;
      if (!title || !start) { ui.toast('Events need a title and start time.'); return; }
      if (end && end <= start) { ui.toast('End must be after start.'); return; }
      const event: CalEvent = { id: createId('evt'), title, date: day, start, end, fixed: true, createdAt: nowIso() };
      store.update((d) => { d.events.push(event); });
      ui.sound('window');
      renderTimeline(body, ui, {});
    });
  });
  body.querySelector('#add-task')!.addEventListener('click', () => {
    const host = body.querySelector('#add-out')!;
    host.innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="nt-title" placeholder="Task" style="flex:2;min-width:140px" />
      <input type="number" id="nt-dur" value="30" min="5" max="480" style="width:90px" aria-label="Minutes" />
      <button class="btn plain small" id="nt-go">Add flexible task</button></div>`;
    host.querySelector('#nt-go')!.addEventListener('click', () => {
      const title = host.querySelector<HTMLInputElement>('#nt-title')!.value.trim();
      const durationMin = Number(host.querySelector<HTMLInputElement>('#nt-dur')!.value || 30);
      if (!title) { ui.toast('Give the task a title.'); return; }
      const task: Task = { id: createId('task'), title, durationMin, flexible: true, done: false, createdAt: nowIso(), updatedAt: nowIso() };
      store.update((d) => { d.tasks.push(task); });
      ui.sound('desk');
      renderTimeline(body, ui, {});
    });
  });
  void opts;
}

const STEP_ICON: Record<string, string> = {
  event: '📌', task: '🧩', prep: '🎒', leaveby: '🚶',
};

function paintCaptain(body: HTMLElement, ui: Ui): void {
  const host = body.querySelector('#cap-out')!;
  const pending = pendingCaptain;
  if (!pending) return;
  const st = store.state;
  const verdict = verifyCaptainPlan(pending.plan, st, day);
  const evName = (id: Id) => st.events.find((e) => e.id === id)?.title ?? id;
  const clothName = (id: Id) => st.clothing.find((c) => c.id === id)?.name ?? id;
  const badge = pending.live
    ? noteHtml('live', pending.direct ? 'Muse key' : 'Muse on', `Captain plan • ${esc(shortModel(pending.model ?? MUSE_MODEL))} • ${Math.round(pending.latencyMs / 1000)}s. ${esc(pending.plan.notes)}`)
    : noteHtml('demo', 'Local', `Local Captain fallback • no model call. ${esc(pending.plan.notes)}`);
  host.innerHTML = `
    <div class="card" style="border-color:var(--sage-deep)">
      <h3>Captain's proposal — nothing applied yet</h3>
      ${badge}
      ${pending.plan.slots.length ? `<ul class="clean">${pending.plan.slots.map((s2) => `<li>🧩 <strong>${esc(s2.start)}</strong> · ${esc(s2.title)} (${s2.durationMin} min)${s2.taskId ? '' : ' <span class="meta">(new)</span>'}</li>`).join('')}</ul>` : '<p class="meta">No slots proposed.</p>'}
      ${pending.plan.prep.length ? `<p class="meta">🎒 Prep: ${pending.plan.prep.map((p) => `${esc(evName(p.eventId))}: ${esc(p.text)}`).join(' · ')}</p>` : ''}
      ${pending.plan.leaveBy.length ? `<p class="meta">🚶 Leave by: ${pending.plan.leaveBy.map((l) => `${esc(l.at)} for ${esc(evName(l.eventId))}`).join(' · ')}</p>` : ''}
      ${pending.plan.outfitIds.length ? `<p class="meta">👔 Outfit: ${pending.plan.outfitIds.map((id) => esc(clothName(id))).join(', ')}</p>` : ''}
      ${pending.plan.pack.length ? `<p class="meta">Pack: ${pending.plan.pack.map(esc).join(', ')}</p>` : ''}
      ${verdict.errors.map((e) => `<p class="missing">${esc(e)}</p>`).join('')}
      ${verdict.warnings.map((w) => `<p class="meta">${esc(w)}</p>`).join('')}
      ${verdict.ok ? '<p class="meta">Code check passed. Fixed events untouched.</p>' : ''}
      <details><summary>Trace</summary><ul class="clean">${pending.plan.trace.map((t) => `<li class="meta">${esc(t)}</li>`).join('')}</ul></details>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        <button class="btn plain small" id="cap-accept" ${verdict.ok ? '' : 'disabled'}>Accept Captain plan</button>
        <button class="btn soft small" id="cap-drop">Discard</button>
      </div>
    </div>`;
  host.querySelector('#cap-accept')!.addEventListener('click', () => {
    const accepted = pendingCaptain!;
    const now = nowIso();
    store.update((d) => {
      for (const s2 of accepted.plan.slots) {
        if (s2.taskId) {
          const t = d.tasks.find((x) => x.id === s2.taskId);
          if (t) { t.start = `${day}T${s2.start}:00`; t.updatedAt = now; }
        } else {
          d.tasks.push({
            id: createId('task'), title: s2.title, durationMin: s2.durationMin,
            flexible: true, start: `${day}T${s2.start}:00`, done: false, createdAt: now, updatedAt: now,
          });
        }
      }
      for (const p of accepted.plan.prep) {
        const e = d.events.find((x) => x.id === p.eventId);
        if (e) e.prep = p.text;
      }
      for (const item of accepted.plan.pack) {
        d.tasks.push({
          id: createId('task'), title: `Pack ${item}`, durationMin: 10,
          flexible: true, done: false, createdAt: now, updatedAt: now,
        });
      }
      if (accepted.plan.outfitIds.length) {
        const first = d.events.find((e) => e.date === day);
        const outfit = { id: createId('out'), name: `Captain pick · ${day}`, itemIds: [...accepted.plan.outfitIds], eventId: first?.id, createdAt: now };
        d.outfits.push(outfit);
        if (first) first.outfitId = outfit.id;
      }
      d.streak = bumpStreak(d.streak, day);
    });
    pendingCaptain = null;
    ui.sound('done');
    const streak = store.state.streak;
    ui.toast(
      streak ? `Captain plan accepted — ${streak.count}-day streak.` : 'Captain plan accepted.',
      { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } },
    );
    renderTimeline(body, ui, {});
  });
  host.querySelector('#cap-drop')!.addEventListener('click', () => {
    pendingCaptain = null;
    renderTimeline(body, ui, {});
  });
}

function paintPlan(body: HTMLElement, ui: Ui): void {
  const host = body.querySelector('#rev-out')!;
  const plan = pendingPlan;
  if (!plan) return;
  const st = store.state;
  const name = (id: Id) => st.tasks.find((t) => t.id === id)?.title ?? id;
  host.innerHTML = `
    <div class="card" style="border-color:var(--sage-deep)">
      <h3>Your plan — nothing applied yet</h3>
      ${plan.steps.length ? `<ul class="clean">${plan.steps.map((s2) => `<li${s2.past ? ' style="opacity:.55"' : ''}>
        ${STEP_ICON[s2.kind] ?? '•'} <strong>${toHM(s2.startMin)}${s2.endMin !== undefined && s2.endMin !== s2.startMin ? '–' + toHM(s2.endMin) : ''}</strong>
        ${esc(s2.title)}${s2.past ? ' <span class="meta">(past)</span>' : ''}${s2.detail ? `<br/><span class="meta">${esc(s2.detail)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="meta">Nothing to plan on this day.</p>'}
      ${plan.deferred.length ? `<p class="meta">Deferred (no room left): ${plan.deferred.map((id) => esc(name(id))).join(', ')}</p>` : ''}
      ${plan.warnings.map((w) => `<p class="missing">${esc(w)}</p>`).join('')}
      ${plan.conflicts.length ? `<p class="missing">${plan.conflicts.map(esc).join('<br/>')}</p>` : '<p class="meta">No conflicts. Fixed events untouched.</p>'}
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn plain small" id="plan-accept" ${plan.placements.length ? '' : 'disabled'}>Accept plan</button>
        <button class="btn soft small" id="plan-drop">Discard</button>
      </div>
      ${plan.placements.length ? '' : '<p class="meta">Nothing new to place — the plan above is already how the day looks.</p>'}
    </div>`;
  host.querySelector('#plan-accept')!.addEventListener('click', () => {
    const accepted = pendingPlan!;
    store.update((d) => {
      for (const p of accepted.placements) {
        const t = d.tasks.find((x) => x.id === p.taskId);
        if (t) { t.start = `${day}T${p.start}:00`; t.updatedAt = nowIso(); }
      }
    });
    pendingPlan = null;
    ui.sound('done');
    ui.toast('Plan accepted — placements saved.', { action: 'Undo', onAction: () => { store.undo(); renderTimeline(body, ui, {}); } });
    renderTimeline(body, ui, {});
  });
  host.querySelector('#plan-drop')!.addEventListener('click', () => {
    pendingPlan = null;
    renderTimeline(body, ui, {});
  });
}

function toHM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export { toMinutes };
