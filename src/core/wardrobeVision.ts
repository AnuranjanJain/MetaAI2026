// Wardrobe-photo drafts: a photo becomes reviewable DetectedClothing
// drafts, and only the drafts the user confirms become Clothing records.
// Pure conversion logic — the photo itself and the DOM live in the view.

import { createId, nowIso } from './model.js';
import type { Clothing, DetectedClothing } from './types.js';

/** Hard cap on photo-backed pieces: photos live in one localStorage JSON. */
export const PHOTO_ITEM_CAP = 12;

export const PHOTO_LABEL =
  'On-device scaffold — no detection runs on this device yet; ' +
  'tag each piece yourself. Nothing is saved until you confirm.';

export function makeDraft(partial: Partial<DetectedClothing> = {}): DetectedClothing {
  return {
    id: createId('det'),
    name: '',
    category: 'top',
    tags: [],
    include: true,
    ...partial,
  };
}

/** Normalize free-form tags: lowercase, trimmed, de-duplicated, capped. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.trim().toLowerCase();
    if (v) seen.add(v);
  }
  return [...seen].slice(0, 8);
}

/**
 * Convert confirmed drafts to Clothing records. Drafts that are excluded
 * or left unnamed are skipped — never guessed at. The shared photo is
 * attached to each confirmed piece.
 */
export function draftsToClothing(
  drafts: readonly DetectedClothing[],
  photoDataUrl?: string,
): Clothing[] {
  const out: Clothing[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    if (!d.include || !name) continue;
    out.push({
      id: createId('clo'),
      name,
      category: d.category,
      color: d.color?.trim() || undefined,
      tags: normalizeTags(d.tags),
      state: 'available',
      photoDataUrl,
      createdAt: nowIso(),
    });
  }
  return out;
}

/** How many saved pieces already carry a photo (against PHOTO_ITEM_CAP). */
export function photoItemCount(clothing: readonly Clothing[]): number {
  return clothing.filter((c) => c.photoDataUrl).length;
}
