// Desk: capture a note or screenshot, review a grounded proposal, and
// confirm it into a task, event, stored item, or reference. Nothing becomes
// a commitment until the user confirms the editable form.

import { store } from '../../store.js';
import { applyProposal, createId, nowIso } from '../../core/model.js';
import { DEMO_LABEL, propose, validateProposal } from '../../core/inference.js';
import { listenOnce, voiceInputSupported } from '../../voice.js';
import type { Capture, Id, Proposal } from '../../core/types.js';
import { esc, type Ui } from '../../shell.js';

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
    if (file && !file.type.startsWith('image/')) {
      ui.toast('That file is not an image.');
      return;
    }
    if (file && file.size > 8 * 1024 * 1024) {
      ui.toast('That image is too large (over 8 MB).');
      return;
    }
    let imageDataUrl: string | undefined;
    if (file) {
      try { imageDataUrl = await readImage(file); }
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
    btn.disabled = true; btn.textContent = '⏺️ Listening…';
    const heard = await listenOnce({});
    btn.disabled = false; btn.textContent = '🎙️ Dictate';
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

function showProposal(body: HTMLElement, ui: Ui, captureId: Id): void {
  const c = store.state.captures.find((x) => x.id === captureId);
  const host = body.querySelector('#proposal')!;
  if (!c) return;
  const p = propose(c.text, c.kind === 'image');
  host.innerHTML = `
    <div class="card" style="border-color:var(--terra)">
      <h3>Confirm before creating <span class="pill terra">${p.confidence} confidence</span></h3>
      <div class="demo-note">${DEMO_LABEL}. Check every field — the source is quoted below.</div>
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
      <div class="row">
        <button class="btn plain" id="p-confirm">Confirm & create</button>
        <button class="btn soft" id="p-archive">Archive</button>
      </div>
    </div>`;
  const fields = host.querySelector('#p-fields')!;
  const paint = () => paintFields(fields, p);
  paint();
  host.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      p.type = b.dataset.type as Proposal['type'];
      host.querySelectorAll('[data-type]').forEach((x) =>
        (x as HTMLButtonElement).className = `btn ${(x as HTMLButtonElement).dataset.type === p.type ? 'plain' : 'soft'} small`);
      paint();
    }));
  host.querySelector('#p-archive')!.addEventListener('click', () => {
    store.update((d) => {
      const cap = d.captures.find((x) => x.id === captureId);
      if (cap) { cap.status = 'archived'; cap.proposal = p; }
    });
    ui.toast('Archived. The source stays on the desk.');
    renderDesk(body, ui, {});
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
    const { task, event, belonging, capture } = applyProposal(cap, p);
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
    renderDesk(body, ui, {});
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
    html += f('Notes (optional)', `<input type="text" data-f="prep" value="${esc(p.prep ?? '')}" />`);
  }
  if (p.type === 'item') {
    html += f('Item name', `<input type="text" data-f="itemName" value="${esc(p.itemName ?? p.title)}" />`);
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
  }
  if (p.type === 'item') {
    p.itemName = get('itemName') || p.title;
    p.prep = get('prep') || undefined;
  }
}

/** Downscale uploads so local persistence stays light. Rejects on failure. */
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
