// Desk: capture a note or screenshot, review a grounded proposal, and
// confirm it into a task, event, stored item, or reference. Nothing becomes
// a commitment until the user confirms the editable form.

import { store } from '../../store.js';
import { applyProposal, createId, nowIso, todayKey } from '../../core/model.js';
import { splitLocationHint, matchLocationHint } from '../../core/assistant.js';
import { DEMO_LABEL, propose, validateProposal } from '../../core/inference.js';
import { resolveProposal } from '../../core/liveModel.js';
import { startListeningUntilDone, voiceInputSupported, type ListeningSession } from '../../voice.js';
import { readImageDataUrl, validateImageFile } from '../../image.js';
import type { Capture, Id, Proposal } from '../../core/types.js';
import { shortModel } from '../../core/muse.js';
import { esc, noteHtml, type Ui } from '../../shell.js';

let dictating: ListeningSession | null = null;

export function renderDesk(body: HTMLElement, ui: Ui, opts: { focusAdd?: boolean }): void {
  const s = store.state;
  const inbox = s.captures.filter((c) => c.status === 'inbox');
  const done = s.captures.filter((c) => c.status !== 'inbox').slice(-6).reverse();

  body.innerHTML = `
    <p class="meta">Drop a screenshot or jot a note. The desk suggests what it means — <strong>you</strong> confirm before anything is scheduled.</p>
    <div class="card"><h3>New capture</h3>
      <label class="field">Note or screenshot caption
        <textarea id="cap-text" rows="3" placeholder="e.g. Dentist appointment tomorrow at 2:30pm, Main St clinic"></textarea>
      </label>
      <p><label class="field">Screenshot or photo (optional)<input type="file" id="cap-file" accept="image/*" /></label></p>
      <p class="meta">Images stay on this device unless you later choose cloud processing.</p>
      <div class="row"><button class="btn plain" id="cap-save">Save to desk</button>${voiceInputSupported() ? `<button class="btn soft" id="cap-mic">🎙️ Dictate</button>` : ''}</div>
    </div>
    <div id="proposal"></div>
    <h3>Inbox <span class="pill ${inbox.length ? 'butter' : ''}">${inbox.length}</span></h3>
    ${inbox.length ? `<ul class="clean">${inbox.map((c) => `
      <li><div class="row"><div class="grow"><strong>${esc(c.name)}</strong>
        <div class="meta">${c.kind === 'image' ? '📷 image' : '📝 note'} · ${new Date(c.createdAt).toLocaleString()}</div>
        ${c.text ? `<div class="meta">“${esc(c.text.slice(0, 120))}”</div>` : ''}</div>
        <button class="btn soft small" data-interpret="${c.id}">Interpret</button></div></li>`).join('')}</ul>`
      : `<p class="meta">Inbox zero. Lovely.</p>`}
    ${done.length ? `<h3>Recently filed</h3><ul class="clean">${done.map((c) => `
      <li><div class="row"><div class="grow">✓ <strong>${esc(c.name)}</strong>
        <div class="meta">${c.resultKind ?? 'archived'}${c.status === 'archived' ? ' · archived' : ''}</div></div>
        <button class="btn soft small" data-view-src="${c.id}">Source</button>
        <button class="btn danger small" data-del="${c.id}">Delete</button></div></li>`).join('')}</ul>` : ''}`;

  if (opts.focusAdd) body.querySelector<HTMLTextAreaElement>('#cap-text')!.focus();

  body.querySelector('#cap-save')!.addEventListener('click', async () => {
    const text = body.querySelector<HTMLTextAreaElement>('#cap-text')!.value.trim();
    const file = body.querySelector<HTMLInputElement>('#cap-file')!.files?.[0];
    if (!text && !file) {
      ui.toast('Write a note or attach an image first.');
      return;
    }
    if (file) {
      const bad = validateImageFile(file);
      if (bad) { ui.toast(bad); return; }
    }
    let imageDataUrl: string | undefined;
    if (file) {
      try { imageDataUrl = await readImageDataUrl(file, { maxDim: 800, quality: 0.72 }); }
      catch { ui.toast('Could not read that image.'); return; }
    }
    const capture: Capture = {
      id: createId('cap'), kind: file ? 'image' : 'note', text,
      imageDataUrl, name: text ? text.slice(0, 48) : (file?.name ?? 'Screenshot'),
      status: 'inbox', createdAt: nowIso(),
    };
    store.update((d) => { d.captures.push(capture); });
    ui.sound('desk');
    ui.toast('On the desk. Interpret it when ready — nothing scheduled yet.');
    renderDesk(body, ui, {});
  });

  body.querySelector<HTMLButtonElement>('#cap-mic')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (dictating) { dictating.stop(); return; }
    const session = startListeningUntilDone({});
    dictating = session;
    btn.textContent = '⏺️ Done';
    const heard = await session.done;
    dictating = null;
    if (!body.isConnected) return;
    btn.textContent = '🎙️ Dictate';
    if (!heard) { ui.toast('Did not catch that — try typing instead.'); return; }
    const box = body.querySelector<HTMLTextAreaElement>('#cap-text')!;
    box.value = box.value ? `${box.value.trim()} ${heard}` : heard;
    box.focus();
  });

  body.querySelectorAll<HTMLButtonElement>('[data-interpret]').forEach((b) =>
    b.addEventListener('click', () => showProposal(body, ui, b.dataset.interpret!)));
  body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => { d.captures = d.captures.filter((c) => c.id !== b.dataset.del); });
      ui.toast('Capture deleted.', { action: 'Undo', onAction: () => store.undo() });
      renderDesk(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-view-src]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = store.state.captures.find((x) => x.id === b.dataset.viewSrc);
      if (!c) return;
      ui.toast(c.text ? `Source: “${c.text.slice(0, 90)}”` : 'Source: image only');
    }));
}

export interface ShowProposalOpts {
  proposal?: Proposal;
  /** Live provenance for the note line (assistant / Muse paths). */
  live?: { direct: boolean; model: string; latencyMs?: number };
  /** Called instead of re-rendering the desk (assistant / live paths). */
  onFinished?: (p: Proposal, outcome: 'confirmed' | 'archived' | 'discarded') => void;
}

export function showProposal(body: HTMLElement, ui: Ui, captureId: Id, opts: ShowProposalOpts = {}): void {
  const c = store.state.captures.find((x) => x.id === captureId);
  const host = body.querySelector('#proposal')!;
  if (!c) return;
  const p = opts.proposal ?? propose(c.text, c.kind === 'image');
  // Voice-style "passport in top drawer": pre-select the hinted spot on
  // item proposals so Confirm places the belonging immediately.
  if (p.type === 'item' && !p.locationHint) {
    const { hint } = splitLocationHint(c.text || p.title);
    const spot = hint ? matchLocationHint(hint, store.state) : null;
    if (spot) p.locationHint = spot.name;
  }
  const canMuse = !opts.proposal && !opts.live && c.text.trim().length >= 3;
  const note = opts.live
    ? noteHtml('live', opts.live.direct ? 'Muse key' : 'Muse on',
      `Proposal • ${esc(shortModel(opts.live.model))}${opts.live.latencyMs !== undefined ? ` • ${Math.round(opts.live.latencyMs / 1000)}s` : ''} — check every field, the source is quoted below.`)
    : noteHtml('demo', 'Demo', `${esc(DEMO_LABEL)}. Check every field — the source is quoted below.`);
  host.innerHTML = `
    <div class="card" style="border-color:var(--terra)">
      <h3>Confirm before creating <span class="pill terra">${p.confidence} confidence</span></h3>
      ${note}
      ${canMuse ? '<p><button class="btn soft small" id="p-muse">Interpret with Muse</button> <span class="meta" id="p-muse-note"></span></p>' : ''}
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">
        ${(['task', 'event', 'item', 'reference'] as const).map((t) =>
          `<button class="btn ${p.type === t ? 'plain' : 'soft'} small" data-type="${t}">${t}</button>`).join('')}
      </div>
      <div id="p-fields"></div>
      ${p.missing.length ? `<p class="missing">Missing: ${p.missing.map(esc).join(' ')}</p>` : ''}
      <p class="meta">${esc(p.rationale)}</p>
      ${c.imageDataUrl ? `<p><img src="${c.imageDataUrl}" alt="Captured screenshot" style="max-width:100%;border-radius:10px" /></p>` : ''}
      ${c.text ? `<p class="meta">Source: “${esc(c.text)}”</p>` : ''}
      <div id="p-errors"></div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn plain" id="p-confirm">Confirm & create</button>
        <button class="btn soft" id="p-archive">Archive</button>
        <button class="btn danger small" id="p-discard">Discard</button>
      </div>
    </div>`;
  const fields = host.querySelector('#p-fields')!;
  const paint = () => paintFields(fields, p);
  paint();
  host.querySelector('#p-muse')?.addEventListener('click', async () => {
    const btn = host.querySelector<HTMLButtonElement>('#p-muse')!;
    const note = host.querySelector('#p-muse-note')!;
    btn.disabled = true;
    note.textContent = 'Asking Muse…';
    try {
      const out = await resolveProposal(c.text, todayKey());
      if (!host.isConnected) return;
      if (!out) {
        note.textContent = 'Muse unavailable — local reading above still works. Keys live in AI setup.';
        ui.toast('Muse interpretation unavailable right now.');
        return;
      }
      showProposal(body, ui, captureId, {
        proposal: out.proposal,
        live: { direct: out.direct, model: out.model, latencyMs: out.latencyMs },
        onFinished: opts.onFinished,
      });
    } finally {
      if (host.isConnected) btn.disabled = false;
    }
  });
  host.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      p.type = b.dataset.type as Proposal['type'];
      host.querySelectorAll('[data-type]').forEach((x) =>
        (x as HTMLButtonElement).className = `btn ${(x as HTMLButtonElement).dataset.type === p.type ? 'plain' : 'soft'} small`);
      paint();
    }));
  /** Every finish path clears the card first — the onFinished caller (e.g.
      hands-free assistant) keeps its sheet open, so the card must go here. */
  const finish = (outcome: 'confirmed' | 'archived' | 'discarded'): void => {
    host.innerHTML = '';
    if (opts.onFinished) opts.onFinished(p, outcome);
    else renderDesk(body, ui, {});
  };
  host.querySelector('#p-archive')!.addEventListener('click', () => {
    store.update((d) => {
      const cap = d.captures.find((x) => x.id === captureId);
      if (cap) { cap.status = 'archived'; cap.proposal = p; }
    });
    ui.toast('Archived. The source stays on the desk.');
    finish('archived');
  });
  host.querySelector('#p-discard')!.addEventListener('click', () => {
    ui.toast('Discarded — nothing created, nothing filed.');
    finish('discarded');
  });
  host.querySelector('#p-confirm')!.addEventListener('click', () => {
    readFields(fields, p);
    const errors = validateProposal(p);
    const errHost = host.querySelector('#p-errors')!;
    if (errors.length) {
      errHost.innerHTML = `<p class="missing">${errors.map(esc).join('<br/>')}</p>`;
      return;
    }
    const cap = store.state.captures.find((x) => x.id === captureId)!;
    const { task, event, belonging, capture } = applyProposal(cap, p, store.state.locations);
    store.update((d) => {
      const i = d.captures.findIndex((x) => x.id === captureId);
      if (i >= 0) d.captures[i] = capture;
      if (task) d.tasks.push(task);
      if (event) d.events.push(event);
      if (belonging) d.belongings.push(belonging);
    });
    ui.sound('done');
    const where = event ? 'timeline' : task ? 'timeline (unscheduled)' : belonging ? 'drawers & shelves' : 'references';
    ui.toast(`Created. Find it in ${where}.`, event ? { action: 'Open day', onAction: () => ui.open('timeline') } : undefined);
    finish('confirmed');
  });
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function paintFields(host: Element, p: Proposal): void {
  const f = (label: string, inner: string) => `<label class="field">${label}${inner}</label>`;
  let html = f('Title', `<input type="text" data-f="title" value="${esc(p.title)}" />`);
  if (p.type === 'event') {
    html += f('Date', `<input type="date" data-f="date" value="${p.date ?? ''}" />`);
    html += `<div class="row">${f('Start', `<input type="time" data-f="time" value="${p.time ?? ''}" />`)}${f('End (optional)', `<input type="time" data-f="endTime" value="${p.endTime ?? ''}" />`)}</div>`;
    html += f('Place (optional)', `<input type="text" data-f="place" value="${esc(p.place ?? '')}" />`);
    html += f('Preparation (optional)', `<input type="text" data-f="prep" value="${esc(p.prep ?? '')}" />`);
  }
  if (p.type === 'task') {
    html += f('Duration (minutes)', `<input type="number" data-f="durationMin" min="5" max="480" value="${p.durationMin ?? 30}" />`);
    html += f('Repeat', `<select data-f="repeat">
      <option value="">Just once</option>
      <option value="daily" ${p.repeat === 'daily' ? 'selected' : ''}>Daily routine</option>
      <option value="weekly" ${p.repeat === 'weekly' ? 'selected' : ''}>Weekly routine</option>
    </select>`);
    html += f('Notes (optional)', `<input type="text" data-f="prep" value="${esc(p.prep ?? '')}" />`);
  }
  if (p.type === 'item') {
    html += f('Item name', `<input type="text" data-f="itemName" value="${esc(p.itemName ?? p.title)}" />`);
    const spots = store.state.locations;
    const hint = (p.locationHint ?? '').toLowerCase();
    html += f('Spot (optional)', `<select data-f="spot">
      <option value="">Not sure yet</option>
      ${spots.map((l) => `<option value="${esc(l.name)}" ${l.name.toLowerCase() === hint ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
    </select>`);
    html += f('Description (optional)', `<input type="text" data-f="prep" value="${esc(p.prep ?? '')}" />`);
  }
  host.innerHTML = html;
}

function readFields(host: Element, p: Proposal): void {
  const get = (k: string) => host.querySelector<HTMLInputElement>(`[data-f="${k}"]`)?.value;
  p.title = get('title') ?? p.title;
  if (p.type === 'event') {
    p.date = get('date') || undefined;
    p.time = get('time') || undefined;
    p.endTime = get('endTime') || undefined;
    p.place = get('place') || undefined;
    p.prep = get('prep') || undefined;
  }
  if (p.type === 'task') {
    p.durationMin = Number(get('durationMin') ?? 30);
    p.prep = get('prep') || undefined;
    const rep = get('repeat');
    p.repeat = rep === 'daily' || rep === 'weekly' ? rep : undefined;
  }
  if (p.type === 'item') {
    p.itemName = get('itemName') || p.title;
    p.locationHint = get('spot')?.trim() || undefined;
    p.prep = get('prep') || undefined;
  }
}
