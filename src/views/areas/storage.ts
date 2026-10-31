// Drawers & shelves: confirmed storage spots, searchable belongings with
// photos and history. Wording always says “last recorded”, never live.

import { store } from '../../store.js';
import { createId, moveBelonging, nowIso } from '../../core/model.js';
import { searchBelongings } from '../../core/inference.js';
import { listenOnce, voiceInputSupported } from '../../voice.js';
import type { Belonging, Id, StorageLocation } from '../../core/types.js';
import { esc, lastStored, type Ui } from '../../shell.js';

export function renderStorage(body: HTMLElement, ui: Ui, _opts: { focusAdd?: boolean }): void {
  const s = store.state;
  body.innerHTML = `
    <p class="meta">Every spot here was confirmed by you. Ask naturally — ambiguous matches are shown, never guessed.</p>
    <div class="row" style="align-items:flex-end">
      <label class="field" style="flex:1">Where did I put…?
        <input type="text" id="st-q" placeholder="e.g. Where did I put the adapter?" autocomplete="off" /></label>
      ${voiceInputSupported() ? `<button class="mic-btn" id="st-mic" aria-label="Ask by voice" title="Ask by voice">🎙️</button>` : ''}
    </div>
    <div id="st-hits" style="margin-top:8px"></div>
    <h3>Spots <span class="pill">${s.locations.length}</span></h3>
    ${s.locations.map((l) => {
      const n = s.belongings.filter((b) => b.locationId === l.id).length;
      return `<div class="card"><div class="row"><div class="grow"><h3>${esc(l.name)}</h3>
        <div class="meta">${n} item${n === 1 ? '' : 's'}${l.note ? ' · ' + esc(l.note) : ''}</div></div>
        <button class="btn danger small" data-del-loc="${l.id}">Delete</button></div></div>`;
    }).join('') || '<p class="meta">No spots yet.</p>'}
    <div class="card"><h3>Add a spot</h3>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <input type="text" id="st-loc" placeholder="e.g. Blue bin, top shelf" style="flex:2;min-width:160px" />
        <button class="btn soft small" id="st-loc-add">Add spot</button></div></div>
    <h3>Belongings <span class="pill">${s.belongings.length}</span></h3>
    ${s.belongings.map((b) => belongingCard(s, b)).join('') || '<p class="meta">Nothing stored yet.</p>'}
    <div class="card"><h3>Remember an item</h3>
      <label class="field">Name<input type="text" id="st-name" placeholder="e.g. Passport" /></label>
      <label class="field">Description (optional)<input type="text" id="st-desc" placeholder="Color, marks, case…" /></label>
      <div class="row" style="margin-top:8px"><label class="field" style="flex:1">Spot
        <select id="st-spot"><option value="">Not sure yet</option>
        ${s.locations.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label></div>
      <p><label class="field">Photo (optional)<input type="file" id="st-photo" accept="image/*" /></label></p>
      <button class="btn plain small" id="st-add">Save item</button></div>`;

  const q = body.querySelector<HTMLInputElement>('#st-q')!;
  const hits = body.querySelector('#st-hits')!;
  body.querySelector<HTMLButtonElement>('#st-mic')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.classList.add('listening'); btn.textContent = '⏺️';
    const heard = await listenOnce({});
    btn.classList.remove('listening'); btn.textContent = '🎙️';
    if (heard) { q.value = heard; q.dispatchEvent(new Event('input')); }
    else ui.toast('Did not catch that — try typing instead.');
  });
  q.addEventListener('input', () => {
    const query = q.value.trim();
    if (query.length < 2) { hits.innerHTML = ''; return; }
    const found = searchBelongings(query, s.belongings, s.locations);
    hits.innerHTML = found.length
      ? `<div class="card" style="border-color:var(--sage-deep)">${found.length > 1 ? `<p class="meta">Several things match — pick the right one:</p>` : ''}
        ${found.map((h) => `<div class="row" style="padding:6px 0"><div class="grow"><strong>${esc(h.belonging.name)}</strong>
          <div class="loc-note">📍 ${esc(lastStored(store.state, h.belonging.id))}</div></div>
          ${h.belonging.photoDataUrl ? `<img src="${h.belonging.photoDataUrl}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px" />` : ''}</div>`).join('')}</div>`
      : `<p class="meta">No matches. Try one key word, e.g. “passport”.</p>`;
  });

  body.querySelector('#st-loc-add')!.addEventListener('click', () => {
    const name = body.querySelector<HTMLInputElement>('#st-loc')!.value.trim();
    if (!name) { ui.toast('Name the spot first.'); return; }
    const loc: StorageLocation = { id: createId('loc'), name, createdAt: nowIso() };
    store.update((d) => { d.locations.push(loc); });
    ui.sound('shelf');
    renderStorage(body, ui, {});
  });
  body.querySelectorAll<HTMLButtonElement>('[data-del-loc]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.delLoc!;
      const used = store.state.belongings.filter((x) => x.locationId === id).length;
      store.update((d) => {
        d.locations = d.locations.filter((l) => l.id !== id);
        for (const x of d.belongings) if (x.locationId === id) x.locationId = undefined;
      });
      ui.toast(used ? `Spot deleted; ${used} item(s) now have no confirmed spot.` : 'Spot deleted.',
        { action: 'Undo', onAction: () => { store.undo(); renderStorage(body, ui, {}); } });
      renderStorage(body, ui, {});
    }));
  body.querySelector('#st-add')!.addEventListener('click', async () => {
    const name = body.querySelector<HTMLInputElement>('#st-name')!.value.trim();
    if (!name) { ui.toast('Name the item first.'); return; }
    const description = body.querySelector<HTMLInputElement>('#st-desc')!.value.trim() || undefined;
    const locationId = body.querySelector<HTMLSelectElement>('#st-spot')!.value || undefined;
    const file = body.querySelector<HTMLInputElement>('#st-photo')!.files?.[0];
    let photoDataUrl: string | undefined;
    if (file && !file.type.startsWith('image/')) { ui.toast('That file is not an image.'); return; }
    if (file && file.size > 8 * 1024 * 1024) { ui.toast('That image is too large (over 8 MB).'); return; }
    if (file) {
      try { photoDataUrl = await readImage(file); }
      catch { ui.toast('Photo unreadable — saved without it.'); }
    }
    const b: Belonging = {
      id: createId('bel'), name, description, locationId, photoDataUrl,
      history: locationId ? [{ locationId, at: nowIso(), note: 'Added' }] : [],
      createdAt: nowIso(),
    };
    store.update((d) => { d.belongings.push(b); });
    ui.sound('shelf');
    ui.toast(locationId ? 'Saved with its spot.' : 'Saved. Add a spot when you know it.');
    renderStorage(body, ui, {});
  });
  body.querySelectorAll<HTMLSelectElement>('[data-move]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const id = sel.dataset.move!;
      if (!sel.value) { renderStorage(body, ui, {}); return; }
      store.update((d) => {
        const i = d.belongings.findIndex((x) => x.id === id);
        if (i >= 0) d.belongings[i] = moveBelonging(d.belongings[i], sel.value || null, 'Moved by user');
      });
      ui.sound('shelf');
      ui.toast('Moved. Checklist “last stored” notes update too.');
      renderStorage(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-del-bel]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => {
        d.belongings = d.belongings.filter((x) => x.id !== b.dataset.delBel);
        for (const c of d.checklist) {
          if (c.belongingId === b.dataset.delBel) { c.belongingId = undefined; if (c.state === 'needed') c.state = 'unresolved'; }
        }
      });
      ui.toast('Item deleted; checklist links kept as unresolved.', { action: 'Undo', onAction: () => { store.undo(); renderStorage(body, ui, {}); } });
      renderStorage(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-pack-it]').forEach((b) =>
    b.addEventListener('click', () => {
      const bel = store.state.belongings.find((x) => x.id === b.dataset.packIt);
      if (!bel) return;
      store.update((d) => {
        d.checklist.push({ id: createId('chk'), label: bel.name, belongingId: bel.id, state: 'needed' });
      });
      ui.toast(`“${bel.name}” added to the leaving list.`, { action: 'Open doorway', onAction: () => ui.open('doorway') });
    }));
}

function belongingCard(s: { locations: StorageLocation[] }, b: Belonging): string {
  const locName = b.locationId ? s.locations.find((l) => l.id === b.locationId)?.name : undefined;
  return `<div class="card"><div class="row"><div class="grow">
    <h3>${esc(b.name)}</h3>
    <div class="loc-note">📍 ${locName ? `Last recorded in ${esc(locName)}` : 'No confirmed location yet'}</div>
    ${b.description ? `<div class="meta">${esc(b.description)}</div>` : ''}
    ${b.history.length ? `<details><summary class="meta">History (${b.history.length})</summary><ul class="clean">${b.history.slice(-5).reverse().map((h) => `
      <li class="meta">${h.locationId ? esc(s.locations.find((l) => l.id === h.locationId)?.name ?? 'a removed spot') : 'No spot'} · ${new Date(h.at).toLocaleString()}${h.note ? ' · ' + esc(h.note) : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
      <select data-move="${b.id}" aria-label="Move ${esc(b.name)}" style="flex:1;min-width:130px">
        <option value="">Move to…</option>
        ${s.locations.map((l) => `<option value="${l.id}" ${l.id === b.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
      <button class="btn soft small" data-pack-it="${b.id}">+ Packing</button>
      <button class="btn danger small" data-del-bel="${b.id}">Delete</button>
    </div></div>
    ${b.photoDataUrl ? `<img src="${b.photoDataUrl}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px" />` : ''}</div></div>`;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 640 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

export type { Id };
