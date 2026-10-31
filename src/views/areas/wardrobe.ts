// Wardrobe: real catalog, honest states, manual outfits, and grounded
// suggestions that only ever use clothes already added.

import { store } from '../../store.js';
import { createId, nowIso, todayKey } from '../../core/model.js';
import { DEMO_LABEL, suggestOutfits } from '../../core/inference.js';
import type { Clothing, ClothingState, Id } from '../../core/types.js';
import { esc, type Ui } from '../../shell.js';

let filter: ClothingState | 'all' = 'all';
let occasion = 'class';

export function renderWardrobe(body: HTMLElement, ui: Ui, _opts: { focusAdd?: boolean }): void {
  const s = store.state;
  const shown = s.clothing.filter((c) => filter === 'all' || c.state === filter);
  const avail = s.clothing.filter((c) => c.state === 'available');
  const suggestions = suggestOutfits(s.clothing, occasion);

  body.innerHTML = `
    <p class="meta">Sample pieces are labeled as samples — suggestions always say how many items are truly yours.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px" role="group" aria-label="Filter by state">
      ${(['all', 'available', 'worn', 'laundry', 'unavailable'] as const).map((f) =>
        `<button class="btn ${filter === f ? 'plain' : 'soft'} small" data-filter="${f}">${f}</button>`).join('')}
    </div>
    ${shown.map((c) => `
      <div class="card"><div class="row"><div class="grow">
        <h3>${esc(c.name)} ${c.sample ? '<span class="pill butter">sample</span>' : ''}</h3>
        <div class="meta">${c.category}${c.color ? ' · ' + esc(c.color) : ''}${c.tags.length ? ' · ' + c.tags.map(esc).join(', ') : ''}</div>
      </div><select data-state="${c.id}" aria-label="State for ${esc(c.name)}">
        ${(['available', 'worn', 'laundry', 'unavailable'] as const).map((v) =>
          `<option value="${v}" ${v === c.state ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div></div>`).join('') || '<p class="meta">Nothing in this state.</p>'}
    <div class="card"><h3>Add clothing</h3>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <input type="text" id="wd-name" placeholder="e.g. Green sweater" style="flex:2;min-width:140px" />
        <select id="wd-cat" style="flex:1;min-width:110px" aria-label="Category">
          ${['top', 'bottom', 'shoes', 'outer', 'other'].map((c) => `<option>${c}</option>`).join('')}
        </select></div>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        <input type="text" id="wd-color" placeholder="Color" style="flex:1;min-width:100px" />
        <input type="text" id="wd-tags" placeholder="Tags: work, casual…" style="flex:2;min-width:140px" />
        <button class="btn soft small" id="wd-add">Add</button></div></div>
    <div class="card"><h3>Suggest for an occasion</h3>
      <div class="demo-note">${DEMO_LABEL} for outfit ideas. Only available catalog items are used.</div>
      <div class="row"><select id="wd-occ" style="flex:1" aria-label="Occasion">
        ${['class', 'work', 'gym', 'evening', 'weekend'].map((o) => `<option ${o === occasion ? 'selected' : ''}>${o}</option>`).join('')}
      </select></div>
      ${suggestions.length ? suggestions.map((sg, i) => `
        <div class="card" style="margin-top:8px;background:var(--sage-wash)"><strong>Idea ${i + 1}</strong>
          <div class="meta">${esc(sg.explanation)}</div>
          <p><button class="btn plain small" data-keep="${i}">Keep this outfit</button></p></div>`).join('')
        : `<p class="missing">Not enough available tops, bottoms, or shoes for a full idea. Add clothes or free some from laundry.</p>`}
    </div>
    <div class="card"><h3>Build an outfit by hand</h3>
      ${avail.length ? `<fieldset><legend>Pick available pieces</legend>
        ${avail.map((c) => `<label style="display:block;font-weight:400;padding:3px 0"><input type="checkbox" data-pick="${c.id}" /> ${esc(c.name)} <span class="meta">(${c.category})</span></label>`).join('')}
        </fieldset>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
          <input type="text" id="wd-oname" placeholder="Outfit name" style="flex:1;min-width:120px" />
          <button class="btn plain small" id="wd-save">Save outfit</button></div>`
        : `<p class="meta">Nothing available right now.</p>`}</div>
    <h3>Outfits <span class="pill">${s.outfits.length}</span></h3>
    ${s.outfits.map((o) => {
      const items = o.itemIds.map((id) => s.clothing.find((c) => c.id === id)?.name ?? '?');
      const ev = o.eventId ? s.events.find((e) => e.id === o.eventId) : undefined;
      return `<div class="card"><h3>${esc(o.name)}</h3>
        <div class="meta">${items.map(esc).join(' · ')}${o.occasion ? ` · for ${esc(o.occasion)}` : ''}${ev ? `<br/>→ Worn to: ${esc(ev.title)} (${ev.date.slice(5)} ${ev.start})` : ''}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <select data-wear="${o.id}" aria-label="Attach ${esc(o.name)} to event" style="flex:1;min-width:140px">
            <option value="">Wear to…</option>
            ${s.events.filter((e) => e.date >= todayKey()).map((e) => `<option value="${e.id}" ${e.id === o.eventId ? 'selected' : ''}>${esc(e.title)} ${e.date.slice(5)}</option>`).join('')}
          </select>
          <button class="btn danger small" data-del-out="${o.id}">Delete</button></div></div>`;
    }).join('') || '<p class="meta">No outfits yet. Keep an idea or build one above.</p>'}`;

  body.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => { filter = b.dataset.filter as typeof filter; renderWardrobe(body, ui, {}); }));
  body.querySelectorAll<HTMLSelectElement>('[data-state]').forEach((sel) =>
    sel.addEventListener('change', () => {
      store.update((d) => {
        const c = d.clothing.find((x) => x.id === sel.dataset.state);
        if (c) c.state = sel.value as ClothingState;
      });
      ui.toast('Updated.', { action: 'Undo', onAction: () => { store.undo(); renderWardrobe(body, ui, {}); } });
      renderWardrobe(body, ui, {});
    }));
  body.querySelector('#wd-add')!.addEventListener('click', () => {
    const name = body.querySelector<HTMLInputElement>('#wd-name')!.value.trim();
    if (!name) { ui.toast('Name the piece first.'); return; }
    const item: Clothing = {
      id: createId('clo'), name,
      category: body.querySelector<HTMLSelectElement>('#wd-cat')!.value as Clothing['category'],
      color: body.querySelector<HTMLInputElement>('#wd-color')!.value.trim() || undefined,
      tags: body.querySelector<HTMLInputElement>('#wd-tags')!.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      state: 'available', createdAt: nowIso(),
    };
    store.update((d) => { d.clothing.push(item); });
    ui.sound('wardrobe');
    renderWardrobe(body, ui, {});
  });
  body.querySelector('#wd-occ')!.addEventListener('change', (e) => {
    occasion = (e.target as HTMLSelectElement).value;
    renderWardrobe(body, ui, {});
  });
  body.querySelectorAll<HTMLButtonElement>('[data-keep]').forEach((b) =>
    b.addEventListener('click', () => {
      const sg = suggestions[Number(b.dataset.keep)];
      store.update((d) => {
        d.outfits.push({ id: createId('out'), name: `${occasion} outfit`, itemIds: [...sg.itemIds], occasion, createdAt: nowIso() });
      });
      ui.sound('done');
      ui.toast('Outfit kept. Attach it to an event below or from the timeline.');
      renderWardrobe(body, ui, {});
    }));
  body.querySelector('#wd-save')!.addEventListener('click', () => {
    const picks = [...body.querySelectorAll<HTMLInputElement>('[data-pick]:checked')].map((c) => c.dataset.pick!);
    const name = body.querySelector<HTMLInputElement>('#wd-oname')!.value.trim() || 'My outfit';
    if (!picks.length) { ui.toast('Pick at least one piece.'); return; }
    store.update((d) => {
      d.outfits.push({ id: createId('out'), name, itemIds: picks, createdAt: nowIso() });
    });
    ui.sound('done');
    renderWardrobe(body, ui, {});
  });
  body.querySelectorAll<HTMLSelectElement>('[data-wear]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const oid = sel.dataset.wear!;
      store.update((d) => {
        const o = d.outfits.find((x) => x.id === oid);
        if (o) o.eventId = sel.value || undefined;
        const ev = d.events.find((x) => x.id === sel.value);
        if (ev) ev.outfitId = oid;
      });
      ui.toast(sel.value ? 'Outfit attached to event.' : 'Detached.');
      renderWardrobe(body, ui, {});
    }));
  body.querySelectorAll<HTMLButtonElement>('[data-del-out]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => {
        d.outfits = d.outfits.filter((x) => x.id !== b.dataset.delOut);
        for (const e of d.events) if (e.outfitId === b.dataset.delOut) e.outfitId = undefined;
      });
      ui.toast('Outfit deleted.', { action: 'Undo', onAction: () => { store.undo(); renderWardrobe(body, ui, {}); } });
      renderWardrobe(body, ui, {});
    }));

  void _opts;
}

export type { Id };
