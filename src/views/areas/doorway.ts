// Doorway: “What do I need before I leave?” Routines build checklists per
// outing; packed states are user-confirmed, never assumed.

import { store } from '../../store.js';
import { buildChecklistForEvent, createId, summarizeChecklist, todayKey } from '../../core/model.js';
import type { CheckState, Id } from '../../core/types.js';
import { esc, lastStored, type Shell, type Ui } from '../../shell.js';
import { speak, voiceOutputSupported } from '../../voice.js';

let selectedEvent: Id | '' = '';

export function renderDoorway(body: HTMLElement, ui: Ui, shell: Shell): void {
  const s = store.state;
  const today = todayKey();
  const events = s.events.filter((e) => e.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  if (selectedEvent && !s.events.some((e) => e.id === selectedEvent)) selectedEvent = '';
  const items = s.checklist.filter((c) => (selectedEvent ? c.eventId === selectedEvent : true));
  const { packed, total } = summarizeChecklist(s.checklist.filter((c) => (selectedEvent ? c.eventId === selectedEvent : true)));
  const eventName = selectedEvent ? s.events.find((e) => e.id === selectedEvent)?.title : 'All outings';

  body.innerHTML = `
    <p class="meta">Packing states are yours to confirm — Pocketroom never claims something is in your bag.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <label class="field" style="flex:1;min-width:160px">Outing
        <select id="dw-event"><option value="">All outings</option>
        ${events.map((e) => `<option value="${e.id}" ${e.id === selectedEvent ? 'selected' : ''}>${esc(e.title)} · ${e.date.slice(5)} ${e.start}</option>`).join('')}</select></label>
      <label class="field" style="flex:1;min-width:140px">Routine
        <select id="dw-routine">${s.routines.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <button class="btn plain small" id="dw-build" ${selectedEvent ? '' : 'disabled title="Pick an outing first"'}>Build list from routine</button>
      <button class="btn soft small" id="dw-late">🏃 I’m running late</button>
      ${voiceOutputSupported() ? `<button class="btn soft small" id="dw-say">🔊 Read list</button>` : ''}
    </div>
    <h3>${esc(eventName ?? '')} <span class="pill ${packed < total ? 'butter' : ''}">${packed}/${total} packed</span></h3>
    ${total > 0 ? `<div class="progress${packed >= total ? ' done' : ''}" role="progressbar" aria-valuenow="${packed}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Packing progress"><span style="width:${Math.round((packed / total) * 100)}%"></span></div>` : ''}
    ${items.length ? `<div>${items.map((c) => checkRow(c.id, c.label, c.state, c.belongingId)).join('')}</div>`
      : `<p class="meta">No items yet. Pick an outing and build from a routine, or add one below.</p>`}
    <div class="card"><h3>Add a one-off</h3>
      <div class="row"><input type="text" id="dw-new" placeholder="e.g. Library book" style="flex:1" />
      <button class="btn soft small" id="dw-add">Add</button></div></div>
    <h3>Routines</h3>
    ${s.routines.map((r) => `
      <div class="card"><div class="row"><div class="grow"><h3>${esc(r.name)}</h3>
        <div class="meta">${r.belongingIds.map((id) => esc(s.belongings.find((b) => b.id === id)?.name ?? '?')).join(', ') || 'No linked items'}
        ${r.tasks.length ? ' · ' + r.tasks.map((t) => esc(t.title)).join(', ') : ''}</div></div>
        <button class="btn danger small" data-del-rou="${r.id}">Delete</button></div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <select data-addr="${r.id}" aria-label="Link item to ${esc(r.name)}" style="flex:1;min-width:140px">
            <option value="">+ Link stored item…</option>
            ${s.belongings.filter((b) => !r.belongingIds.includes(b.id)).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
          </select>
        </div></div>`).join('')}
    <div class="card"><h3>New routine</h3>
      <div class="row"><input type="text" id="dw-rou" placeholder="e.g. Overnight stay" style="flex:1" />
      <button class="btn soft small" id="dw-rou-add">Create</button></div></div>`;

  body.querySelector('#dw-event')!.addEventListener('change', (e) => {
    selectedEvent = (e.target as HTMLSelectElement).value;
    renderDoorway(body, ui, shell);
  });
  body.querySelector('#dw-build')!.addEventListener('click', () => {
    const routineId = body.querySelector<HTMLSelectElement>('#dw-routine')!.value;
    if (!routineId) { ui.toast('Create a routine first.'); return; }
    const fresh = buildChecklistForEvent(store.state, selectedEvent, routineId);
    if (!fresh.length) { ui.toast('Nothing new — that list already covers this routine.'); return; }
    store.update((d) => { d.checklist.push(...fresh); });
    ui.sound('doorway');
    ui.toast(`Added ${fresh.length} items to the list.`);
    renderDoorway(body, ui, shell);
  });
  body.querySelector('#dw-late')!.addEventListener('click', () => {
    ui.close();
    shell.setLate(true);
    ui.toast('Late mode: essentials first.');
  });
  body.querySelector('#dw-say')?.addEventListener('click', () => {
    const remaining = items.filter((c) => c.state === 'needed' || c.state === 'unresolved');
    speak(remaining.length
      ? `Still to pack for ${eventName}: ${remaining.map((c) => c.label).join(', ')}.`
      : 'Everything is packed. You are ready to go.');
  });
  body.querySelectorAll<HTMLSelectElement>('[data-check]').forEach((sel) =>
    sel.addEventListener('change', () => {
      store.update((d) => {
        const it = d.checklist.find((x) => x.id === sel.dataset.check);
        if (it) it.state = sel.value as CheckState;
      });
      if (sel.value === 'packed') ui.sound('pack');
      renderDoorway(body, ui, shell);
    }));
  body.querySelector('#dw-add')!.addEventListener('click', () => {
    const label = body.querySelector<HTMLInputElement>('#dw-new')!.value.trim();
    if (!label) { ui.toast('Name the item first.'); return; }
    store.update((d) => {
      d.checklist.push({
        id: createId('chk'), label, state: 'needed',
        eventId: selectedEvent || undefined,
      });
    });
    renderDoorway(body, ui, shell);
  });
  body.querySelectorAll<HTMLButtonElement>('[data-locate]').forEach((b) =>
    b.addEventListener('click', () => ui.open('storage')));
  body.querySelectorAll<HTMLButtonElement>('[data-del-rou]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => { d.routines = d.routines.filter((r) => r.id !== b.dataset.delRou); });
      ui.toast('Routine deleted.', { action: 'Undo', onAction: () => { store.undo(); renderDoorway(body, ui, shell); } });
      renderDoorway(body, ui, shell);
    }));
  body.querySelector('#dw-rou-add')!.addEventListener('click', () => {
    const name = body.querySelector<HTMLInputElement>('#dw-rou')!.value.trim();
    if (!name) { ui.toast('Name the routine first.'); return; }
    store.update((d) => { d.routines.push({ id: createId('rou'), name, belongingIds: [], tasks: [] }); });
    renderDoorway(body, ui, shell);
  });
  body.querySelectorAll<HTMLSelectElement>('[data-addr]').forEach((sel) =>
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const rid = sel.dataset.addr!;
      store.update((d) => {
        const r = d.routines.find((x) => x.id === rid);
        if (r && !r.belongingIds.includes(sel.value)) r.belongingIds.push(sel.value);
      });
      renderDoorway(body, ui, shell);
    }));
}

function checkRow(id: Id, label: string, state: CheckState, belongingId?: Id): string {
  const s = store.state;
  const b = belongingId ? s.belongings.find((x) => x.id === belongingId) : undefined;
  return `<div class="check ${state === 'packed' ? 'packed' : ''}"><div class="label"><strong>${esc(label)}</strong>
    ${b ? `<div class="loc-note">📍 ${esc(lastStored(s, b.id))} <button class="btn soft small" data-locate="${b.id}" style="min-height:28px;padding:2px 8px">Find</button></div>
    ${b.photoDataUrl ? `<img src="${b.photoDataUrl}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;margin-top:4px" />` : ''}` : ''}
    </div>
    <select data-check="${id}" aria-label="State for ${esc(label)}">
      ${(['needed', 'packed', 'skipped', 'unresolved'] as const).map((v) =>
        `<option value="${v}" ${v === state ? 'selected' : ''}>${v}</option>`).join('')}
    </select></div>`;
}
