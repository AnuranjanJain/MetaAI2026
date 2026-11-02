// Wardrobe: real catalog, honest states, manual outfits, and grounded
// suggestions that only ever use clothes already added.

import { store } from '../../store.js';
import { createId, nowIso, todayKey } from '../../core/model.js';
import { DEMO_LABEL, occasionFromEvent, suggestOutfits } from '../../core/inference.js';
import { PHOTO_DIRECT_LABEL, PHOTO_ITEM_CAP, PHOTO_LABEL, PHOTO_LIVE_LABEL, draftsFromPieces, draftsToClothing, makeDraft, photoItemCount } from '../../core/wardrobeVision.js';
import { liveModeActive, samSegmentViaMuse, tagPhotoDirect, tagPhotoViaMuse } from '../../core/liveModel.js';
import { maskSvg, type SamMask } from '../../core/sam.js';
import { getKey, hasKey } from '../../core/byok.js';
import { readImageDataUrl, validateImageFile } from '../../image.js';
import type { Clothing, ClothingState, DetectedClothing, Id } from '../../core/types.js';
import { esc, type Ui } from '../../shell.js';

let filter: ClothingState | 'all' = 'all';
let occasion = 'class';
// Wardrobe-photo scaffold: one shared photo + hand-tagged drafts, held
// across re-renders until the user confirms or leaves them behind.
let photoUrl: string | undefined;
let photoDrafts: DetectedClothing[] = [];
let photoVia: 'direct' | 'proxy' | null = null;
let detecting = false;
// SAM segmentation (Meta-only, proxy): masks for one concept phrase,
// held across re-renders until the user drafts them or picks a photo.
let segmentConcept = 'shirt';
let segmentMasks: SamMask[] = [];
let segmenting = false;

export function renderWardrobe(body: HTMLElement, ui: Ui, _opts: { focusAdd?: boolean }): void {
  const s = store.state;
  const shown = s.clothing.filter((c) => filter === 'all' || c.state === filter);
  const avail = s.clothing.filter((c) => c.state === 'available');
  const suggestions = suggestOutfits(s.clothing, occasion);
  const todayEvent = s.events
    .filter((e) => e.date === todayKey() && occasionFromEvent(e.title))
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  body.innerHTML = `
    <p class="meta">Sample pieces are labeled as samples — suggestions always say how many items are truly yours.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px" role="group" aria-label="Filter by state">
      ${(['all', 'available', 'worn', 'laundry', 'unavailable'] as const).map((f) =>
        `<button class="btn ${filter === f ? 'plain' : 'soft'} small" data-filter="${f}">${f}</button>`).join('')}
    </div>
    ${shown.map((c) => `
      <div class="card"><div class="row">${c.photoDataUrl ? `<img src="${c.photoDataUrl}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px" />` : ''}<div class="grow">
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
    <div class="card"><h3>Add from photo</h3>
      <div class="demo-note">${esc(photoVia === 'direct' ? PHOTO_DIRECT_LABEL : photoVia ? PHOTO_LIVE_LABEL : PHOTO_LABEL)}</div>
      ${photoVia ? '' : '<p><button class="btn soft small" id="wd-setup">AI setup — add a key for live detection</button></p>'}
      <p><label class="field">Wardrobe photo<input type="file" id="wd-photo" accept="image/*" /></label></p>
      ${photoUrl ? `<img src="${photoUrl}" alt="Your wardrobe photo" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px" />
        ${photoDrafts.map((d, i) => draftRow(d, i)).join('')}
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
          <button class="btn soft small" id="wd-detect" ${detecting ? 'disabled' : ''}>${detecting ? 'Detecting…' : 'Detect pieces'}</button>
          <button class="btn soft small" id="wd-draft-add">+ Add a piece</button>
          <button class="btn plain small" id="wd-draft-save">Save confirmed pieces</button>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
          <input type="text" id="wd-seg-concept" value="${esc(segmentConcept)}" placeholder="Segment: e.g. shirt" style="flex:1;min-width:120px" aria-label="Segment concept" />
          <button class="btn soft small" id="wd-segment" ${segmenting ? 'disabled' : ''}>${segmenting ? 'Segmenting…' : 'Segment'}</button>
        </div>
        ${segmentMasks.length ? `<p class="meta">SAM 3.1 found ${segmentMasks.length} mask${segmentMasks.length === 1 ? '' : 's'} for “${esc(segmentConcept)}” — tap + to draft one.</p>
        <div class="row" style="flex-wrap:wrap;gap:8px">${segmentMasks.map((m, i) =>
          `<div style="width:72px"><img src="data:image/svg+xml,${encodeURIComponent(maskSvg(m))}" alt="Mask ${i + 1}" style="width:72px;height:72px;object-fit:contain;border-radius:8px;background:var(--sage-wash)" /><br/><button class="btn soft small" data-seg-add="${i}">+ Draft</button></div>`).join('')}</div>` : ''}` : '<p class="meta">Pick a photo of your wardrobe, then tag the pieces in it.</p>'}
      <p class="meta">${photoItemCount(s.clothing)}/${PHOTO_ITEM_CAP} photo-backed pieces. ${photoVia === 'direct' ? 'This photo was sent to the Muse API with your key when you tapped Detect — the downscaled copy is attached to each piece you save.' : photoVia ? 'This photo was sent to the proxy for detection when you tapped Detect — the downscaled copy is attached to each piece you save.' : 'The downscaled photo is attached to each piece you save and never leaves this device.'}</p>
    </div>
    <div class="card"><h3>Suggest for an occasion</h3>
      <div class="demo-note">${DEMO_LABEL} for outfit ideas. Only available catalog items are used.</div>
      ${todayEvent ? `<p class="meta">Today — from your events: <strong>${esc(occasionFromEvent(todayEvent.title)!)}</strong> (“${esc(todayEvent.title)}”) <button class="btn soft small" id="wd-today">Use this</button></p>` : ''}
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
  body.querySelector('#wd-today')?.addEventListener('click', () => {
    const occ = todayEvent ? occasionFromEvent(todayEvent.title) : undefined;
    if (occ) occasion = occ;
    renderWardrobe(body, ui, {});
  });
  body.querySelector('#wd-photo')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bad = validateImageFile(file);
    if (bad) { ui.toast(bad); return; }
    try {
      photoUrl = await readImageDataUrl(file, { maxDim: 480, quality: 0.72 });
      photoDrafts = [makeDraft()];
      photoVia = null;
      segmentMasks = [];
      renderWardrobe(body, ui, {});
    } catch { ui.toast('Could not read that photo.'); }
  });
  body.querySelector('#wd-detect')?.addEventListener('click', async () => {
    if (!photoUrl || detecting) return;
    const via = hasKey() ? 'direct' : liveModeActive() ? 'proxy' : null;
    if (!via) {
      ui.toast('Detection needs your Muse key or live mode on.');
      return;
    }
    syncDraftsFromDom(body);
    detecting = true;
    renderWardrobe(body, ui, {});
    try {
      const pieces = via === 'direct'
        ? await tagPhotoDirect(photoUrl, getKey() ?? '')
        : await tagPhotoViaMuse(photoUrl);
      if (!body.isConnected) return;
      if (!pieces) { ui.toast('Detection unavailable — tag by hand.'); return; }
      if (!pieces.length) { ui.toast('No garments found — tag by hand.'); return; }
      photoDrafts = draftsFromPieces(pieces);
      photoVia = via;
      ui.toast(`Detected ${pieces.length} piece${pieces.length === 1 ? '' : 's'} — edit and confirm what you keep.`);
    } finally {
      detecting = false;
      if (body.isConnected) renderWardrobe(body, ui, {});
    }
  });
  body.querySelector('#wd-segment')?.addEventListener('click', async () => {
    if (!photoUrl || segmenting) return;
    if (!liveModeActive()) {
      ui.toast('Segment needs live mode on (proxy).');
      return;
    }
    const concept = body.querySelector<HTMLInputElement>('#wd-seg-concept')!.value.trim() || 'shirt';
    if (concept.length > 40) { ui.toast('Keep the concept under 40 characters.'); return; }
    syncDraftsFromDom(body);
    segmentConcept = concept;
    segmenting = true;
    renderWardrobe(body, ui, {});
    try {
      const out = await samSegmentViaMuse(photoUrl, concept);
      if (!body.isConnected) return;
      if (!out) { ui.toast('Segmentation unavailable — tag by hand.'); return; }
      if (!out.masks.length) { ui.toast('No masks found — try another word.'); return; }
      segmentMasks = out.masks;
      ui.toast(`Segmented ${out.masks.length} mask${out.masks.length === 1 ? '' : 's'} — tap + to draft one.`);
    } finally {
      segmenting = false;
      if (body.isConnected) renderWardrobe(body, ui, {});
    }
  });
  body.querySelectorAll<HTMLButtonElement>('[data-seg-add]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = segmentMasks[Number(b.dataset.segAdd)];
      if (!m) return;
      syncDraftsFromDom(body);
      photoDrafts.push(makeDraft({ name: `${segmentConcept} ${photoDrafts.length + 1}` }));
      photoVia = photoVia ?? 'proxy';
      ui.toast('Draft added from mask — name it and save.');
      renderWardrobe(body, ui, {});
    }));
  body.querySelector('#wd-setup')?.addEventListener('click', () => ui.setup());
  body.querySelector('#wd-draft-add')?.addEventListener('click', () => {
    syncDraftsFromDom(body);
    photoDrafts.push(makeDraft());
    renderWardrobe(body, ui, {});
  });
  body.querySelectorAll<HTMLButtonElement>('[data-draft-del]').forEach((b) =>
    b.addEventListener('click', () => {
      syncDraftsFromDom(body);
      photoDrafts.splice(Number(b.dataset.draftDel), 1);
      renderWardrobe(body, ui, {});
    }));
  body.querySelector('#wd-draft-save')?.addEventListener('click', () => {
    syncDraftsFromDom(body);
    const items = draftsToClothing(photoDrafts, photoUrl);
    if (!items.length) { ui.toast('Name at least one piece and keep “Save this piece” ticked.'); return; }
    const room = PHOTO_ITEM_CAP - photoItemCount(store.state.clothing);
    if (items.length > room) {
      ui.toast(`Photo pieces are capped at ${PHOTO_ITEM_CAP} to keep on-device storage light — only ${room} slot(s) left.`);
      return;
    }
    store.update((d) => { d.clothing.push(...items); });
    photoUrl = undefined;
    photoDrafts = [];
    photoVia = null;
    ui.sound('wardrobe');
    ui.toast(`Saved ${items.length} piece${items.length === 1 ? '' : 's'} from your photo.`,
      { action: 'Undo', onAction: () => { store.undo(); renderWardrobe(body, ui, {}); } });
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

function draftRow(d: DetectedClothing, i: number): string {
  return `<div class="card" style="margin-top:8px">
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <input type="text" data-df="name" data-di="${i}" value="${esc(d.name)}" placeholder="Piece name — e.g. Blue hoodie" style="flex:2;min-width:140px" aria-label="Piece name" />
      <select data-df="category" data-di="${i}" style="flex:1;min-width:100px" aria-label="Category">
        ${(['top', 'bottom', 'shoes', 'outer', 'other'] as const).map((c) =>
          `<option value="${c}" ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}
      </select></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <input type="text" data-df="color" data-di="${i}" value="${esc(d.color ?? '')}" placeholder="Color" style="flex:1;min-width:90px" aria-label="Color" />
      <input type="text" data-df="tags" data-di="${i}" value="${esc(d.tags.join(', '))}" placeholder="Tags: casual, class…" style="flex:2;min-width:140px" aria-label="Tags" />
    </div>
    <div class="row" style="margin-top:8px">
      <label style="font-weight:400"><input type="checkbox" data-df="include" data-di="${i}" ${d.include ? 'checked' : ''} /> Save this piece</label>
      <button class="btn danger small" data-draft-del="${i}">Remove</button>
    </div></div>`;
}

/** Pull every draft input back into module state before a re-render or save. */
function syncDraftsFromDom(body: HTMLElement): void {
  body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-df]').forEach((el) => {
    const d = photoDrafts[Number(el.dataset.di)];
    if (!d) return;
    switch (el.dataset.df) {
      case 'name': d.name = (el as HTMLInputElement).value; break;
      case 'color': d.color = (el as HTMLInputElement).value || undefined; break;
      case 'tags': d.tags = (el as HTMLInputElement).value.split(','); break;
      case 'category': d.category = el.value as DetectedClothing['category']; break;
      case 'include': d.include = (el as HTMLInputElement).checked; break;
    }
  });
}

export type { Id };
