// SAM 3.1 segmentation results: pure allowlist + caps. The proxy consumes the
// streaming Responses API and returns plain mask records; this module validates
// them before the wardrobe view renders anything. Pure: no DOM, no network.

export interface SamBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One segmentation mask: an SVG path plus its raster dimensions. */
export interface SamMask {
  objectId: string;
  /** SVG path data ("M…z…") in a width×height viewBox. */
  svg: string;
  width: number;
  height: number;
  box?: SamBox;
}

export interface SamResult {
  masks: SamMask[];
  outcome: string;
}

const MAX_MASKS = 12;
const MAX_SVG_CHARS = 200000;
const MAX_DIM = 4000;

function isBox(v: unknown): v is SamBox {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  return (['left', 'top', 'right', 'bottom'] as const).every(
    (k) => typeof b[k] === 'number' && Number.isFinite(b[k]) && (b[k] as number) >= 0,
  );
}

/** Allowlist one mask record. Any unparseable entry fails the batch closed. */
function toMask(value: unknown): SamMask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.objectId !== 'string' || !o.objectId || o.objectId.length > 80) return null;
  if (typeof o.svg !== 'string') return null;
  const svg = o.svg.trim();
  if (!svg || svg.length > MAX_SVG_CHARS) return null;
  // SVG path data starts with M/m, or a full inline <svg>/<path> fragment.
  if (!/^[Mm]/.test(svg) && !/^<(svg|path)\b/.test(svg)) return null;
  if (typeof o.width !== 'number' || typeof o.height !== 'number') return null;
  const w = Math.round(o.width);
  const h = Math.round(o.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > MAX_DIM || h > MAX_DIM) return null;
  if (o.box !== undefined && o.box !== null && !isBox(o.box)) return null;
  return {
    objectId: o.objectId,
    svg,
    width: w,
    height: h,
    ...(o.box != null ? { box: o.box as SamBox } : {}),
  };
}

/** Allowlist a proxy SAM reply into exact-shape masks. Empty is valid. */
export function toSamResult(value: unknown): SamResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const raw = o.masks;
  if (!Array.isArray(raw) || raw.length > MAX_MASKS) return null;
  const masks: SamMask[] = [];
  for (const m of raw) {
    const mask = toMask(m);
    if (!mask) return null;
    masks.push(mask);
  }
  const outcome = typeof o.outcome === 'string' ? o.outcome.slice(0, 40) : 'ok';
  return { masks, outcome };
}

/** Render one mask as a standalone SVG string for thumbnails. Pure. */
export function maskSvg(m: SamMask, fill = 'black'): string {
  const inner = /^</.test(m.svg.trim()) ? m.svg : `<path d="${m.svg}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}">${inner}</svg>`;
}
