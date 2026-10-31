// Window into the day: fixed events, scheduled + unscheduled flexible tasks,
// accessible scheduling controls, and reviewed schedule revisions.

import { store } from '../../store.js';
import { addDaysKey, buildChecklistForEvent, createId, nowIso, todayKey } from '../../core/model.js';
import { DEMO_LABEL } from '../../core/inference.js';
import { detectConflicts, freeWindows, toMinutes } from '../../core/schedule.js';
import { buildDayPlan, type DayPlan } from '../../core/planner.js';
import type { CalEvent, Id, Task } from '../../core/types.js';
import { esc, type Ui } from '../../shell.js';
import { speak, voiceOutputSupported } from '../../voice.js';

let day = todayKey();
let pendingPlan: DayPlan | null = null;

export function renderTimeline(body: HTMLElement, ui: Ui, opts: { focusAdd?: boolean }): void {
  const s = store.state;
  const events = s.events.filter((e) => e.date === day).sort((a, b) => a.start.localeCompare(b.start));
  const scheduled = s.tasks.filter((t) => !t.done && t.start?.slice(0, 10) === day)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const unscheduled = s.tasks.filter((t) => !t.done && !t.start);
  const conflicts = detectConflicts(s.events, day);
  const windows = freeWindows(s.events, day);

  body.innerHTML = `
    <div class="row" style="margin-bottom:8px">
      <button class="btn soft small" data-day="-1">← Prev</button>
      <div class="grow" style="text-align:center"><strong>${day === todayKey() ? 'Today · ' : ''}${esc(day)}</strong></div>
      <button class="btn soft small" data-day="1">Next →</button>
    </div>
    ${voiceOutputSupported() ? `<p><button class="btn soft small" id="day-say">🔊 Read my day</button></p>` : ''}
    ${conflicts.length ? `<div class="card" style="border-color:var(--danger)"><strong>Scheduling conflicts</strong><ul class="clean">${conflicts.map((c) => `<li class="missing">${esc(c)}</li>`).join('')}</ul></div>` : ''}
    <h3>Fixed plans</h3>
    ${events.length ? events.map((e) => eventCard(e)).join('') : `<p class="meta">Nothing fixed on this day.</p>`}
    <h3>Scheduled tasks</h3>
    ${scheduled.length ? scheduled.map((t) => taskRow(t, true)).join('') : `<p class="meta">No tasks placed yet.</p>`}
    <h3>Unscheduled <span class="pill ${unscheduled.length ? 'butter' : ''}">${unscheduled.length}</span></h3>
    ${unscheduled.length ? unscheduled.map((t) => taskRow(t, false)).join('') : `<p class="meta">Everything has a time. Calm.</p>`}
    ${windows.length ? `<h3>Open windows</h3><ul class="clean">${windows.map((w) => `<li class="meta">${toHM(w.start)} – ${toHM(w.end)} free</li>`).join('')}</ul>` : ''}
    <div class="card"><h3>Plan my day</h3>
      <div class="demo-note">${DEMO_LABEL} for schedule proposals. Fixed events never move; you review every change.</div>
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
    <div class="card"><h3>Add to the day</h3>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn soft small" id="add-event">+ Event</button>
        <button class="btn soft small" id="add-task">+ Flexible task</button>
      </div><div id="add-out" style="margin-top:8px"></div></div>`;

  if (pendingPlan) paintPlan(body, ui);
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
      <button class="btn danger small" data-del-event="${e.id}">Delete</button>
    </div></div></div></div>`;
}

function taskRow(t: Task, scheduled: boolean): string {
  return `<div class="card tl-block"><div class="row"><div class="grow">
    <div class="when">${scheduled && t.start ? t.start.slice(11, 16) : 'unscheduled'} · ${t.durationMin} min</div>
    <h3 class="title">${esc(t.title)}</h3>${t.notes ? `<div class="meta">${esc(t.notes)}</div>` : ''}
    ${!scheduled ? `<div class="row" style="margin-top:6px"><input type="time" value="12:00" data-slot="${t.id}" aria-label="Time for ${esc(t.title)}" style="width:auto" />
      <button class="btn soft small" data-place="${t.id}">Place</button></div>` : ''}
    </div><div><button class="btn soft small" data-done="${t.id}">Done</button>
    ${scheduled ? `<div style="margin-top:6px"><button class="btn soft small" data-unplace="${t.id}">Unschedule</button></div>` : ''}</div></div></div>`;
}

function wire(body: HTMLElement, ui: Ui, events: CalEvent[], scheduled: Task[], unscheduled: Task[], opts: { focusAdd?: boolean }): void {
  body.querySelector('#day-say')?.addEventListener('click', () => {
    const label = day === todayKey() ? 'Today' : day;
    const bits: string[] = [];
    if (events.length) bits.push(`${events.length} fixed event${events.length === 1 ? '' : 's'}: ${events.map((e) => `${e.title} at ${e.start}`).join(', ')}`);
    else bits.push('no fixed events');
    bits.push(scheduled.length ? `${scheduled.length} scheduled task${scheduled.length === 1 ? '' : 's'}` : 'no scheduled tasks');
    bits.push(unscheduled.length ? `${unscheduled.length} unscheduled` : 'nothing unscheduled');
    speak(`${label}. ${bits.join('. ')}.`);
  });
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
