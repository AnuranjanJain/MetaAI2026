// Today's Room: a shallow layered SVG interior, laid out like a real room —
// wardrobe left, desk centre under a shelf, window + door attached on the
// right, stereo speakers mounted high, every base on the same floor line.
// Status lives in the shell's side rails, never painted over furniture.

import type { AppState, DecorPrefs } from '../core/types.js';
import { summarizeChecklist, todayKey } from '../core/model.js';

export type Area = 'desk' | 'doorway' | 'wardrobe' | 'storage' | 'timeline' | 'clatter' | 'decor';

const INK = '#20302a';
const FLOOR = '#d9cba6';
const WOOD = '#b98a5e';
const WOOD_D = '#96683f';
const SAGE = '#9db4a0';
const SAGE_D = '#57705d';
const BUTTER = '#f2d675';
const TERRA = '#c96f4a';
const TEAL = '#6f9a94';

const WALLS: Record<DecorPrefs['wall'], string> = {
  ivory: '#efe4cf', sage: '#dfe8d6', butter: '#f6e7b4', sky: '#d2e3ec', blush: '#f1d6c6',
};
export const WALL_OPTIONS = Object.keys(WALLS) as DecorPrefs['wall'][];
export const POSTER_OPTIONS: { id: DecorPrefs['poster']; label: string }[] = [
  { id: 'none', label: 'No poster' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'peaks', label: 'Peaks' },
  { id: 'quote', label: 'Note card' },
  { id: 'garden', label: 'Garden' },
];

const BASE = 294; // shared ground line: every furniture foot lands here

/** Paints the card behind the SVG with the same wall/floor colours so the
    room appears to run the full height of the frame (see renderRoom). */
const painters = new WeakMap<HTMLElement, ResizeObserver>();

function hinge(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="6" height="16" rx="2" fill="${INK}" opacity="0.75"/>`;
}
function dot(cx: number, cy: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="7" fill="${fill}" stroke="#fffdf6" stroke-width="2.5" aria-hidden="true"/>`;
}

function hotspot(id: Area, label: string, x: number, y: number, w: number, h: number, art: string): string {
  return `<g class="room-hotspot" data-area="${id}" tabindex="0" role="button" aria-label="${label}">
    <rect class="halo" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="14"
      fill="none" stroke="${TERRA}" stroke-width="3"/>
    ${art}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="transparent"/>
  </g>`;
}

export function nextCommitment(state: AppState): string | null {
  const today = todayKey();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = state.events
    .filter((e) => e.date === today && (e.end ?? e.start) > hhmm)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!upcoming) return null;
  return `${upcoming.start} · ${upcoming.title}`;
}

function posterArt(decor: DecorPrefs): string {
  if (decor.poster === 'none') return '';
  const frame = `<rect x="222" y="24" width="120" height="60" rx="6" fill="${WOOD_D}"/>`;
  if (decor.poster === 'custom') {
    if (decor.customPoster) {
      return `${frame}<image href="${decor.customPoster}" x="228" y="30" width="108" height="48" preserveAspectRatio="xMidYMid slice"/>`;
    }
    // Custom chosen but image gone (old save) — fall back to sunset scene.
    return `${frame}<rect x="228" y="30" width="108" height="48" fill="#bcd3dd"/><circle cx="282" cy="52" r="10" fill="${BUTTER}"/><rect x="228" y="62" width="108" height="16" fill="${SAGE}"/>`;
  }
  const scenes: Record<Exclude<DecorPrefs['poster'], 'none' | 'custom'>, string> = {
    sunset: `<rect x="228" y="30" width="108" height="48" fill="#bcd3dd"/><circle cx="282" cy="52" r="10" fill="${BUTTER}"/><rect x="228" y="62" width="108" height="16" fill="${SAGE}"/>`,
    peaks: `<rect x="228" y="30" width="108" height="48" fill="#eaf0e9"/><polygon points="228,78 256,44 284,78" fill="${SAGE_D}"/><polygon points="268,78 294,50 336,78" fill="${SAGE}"/>`,
    quote: `<rect x="228" y="30" width="108" height="48" fill="#fffdf6"/><rect x="238" y="40" width="76" height="5" rx="2" fill="${INK}" opacity="0.65"/><rect x="238" y="51" width="56" height="5" rx="2" fill="${INK}" opacity="0.45"/><rect x="238" y="62" width="64" height="5" rx="2" fill="${TERRA}" opacity="0.7"/>`,
    garden: `<rect x="228" y="30" width="108" height="48" fill="#eef3e4"/><line x1="282" y1="78" x2="282" y2="54" stroke="${SAGE_D}" stroke-width="3"/><circle cx="282" cy="47" r="8" fill="${TERRA}"/><circle cx="272" cy="54" r="5" fill="${BUTTER}"/><circle cx="292" cy="54" r="5" fill="${BUTTER}"/>`,
  };
  return `${frame}${scenes[decor.poster]}`;
}

function speakerArt(x: number): string {
  // Wall-mounted bookshelf speaker: cabinet depth, tweeter over woofer,
  // grille ring, and a small mounting shelf it actually sits on.
  return `<rect x="${x + 3}" y="17" width="40" height="52" rx="7" fill="${INK}" opacity="0.25"/>
    <rect x="${x}" y="12" width="40" height="52" rx="7" fill="${INK}"/>
    <rect x="${x + 4}" y="16" width="32" height="44" rx="5" fill="#2e4238"/>
    <circle cx="${x + 20}" cy="26" r="5" fill="${SAGE}"/>
    <circle cx="${x + 20}" cy="46" r="11" fill="${SAGE}"/>
    <circle cx="${x + 20}" cy="46" r="6" fill="#2e4238"/>
    <rect x="${x - 4}" y="64" width="48" height="6" rx="3" fill="${WOOD_D}"/>`;
}

export function renderRoom(el: HTMLElement, state: AppState, onOpen: (a: Area) => void): void {
  const inbox = state.captures.filter((c) => c.status === 'inbox').length;
  const { packed, total } = summarizeChecklist(state.checklist);
  const remaining = total - packed;
  const ready = total > 0 && remaining === 0;
  const decor: DecorPrefs = state.decor ?? { wall: 'ivory', poster: 'sunset' };

  const wardrobeArt = `
    <ellipse cx="94" cy="${BASE + 3}" rx="76" ry="7" fill="${INK}" opacity="0.14"/>
    <rect x="30" y="108" width="128" height="${BASE - 108}" rx="8" fill="${WOOD}"/>
    <rect x="30" y="108" width="128" height="16" rx="8" fill="${WOOD_D}"/>
    <line x1="94" y1="124" x2="94" y2="${BASE}" stroke="${WOOD_D}" stroke-width="4"/>
    ${hinge(30, 138)}${hinge(30, 196)}${hinge(30, 252)}
    ${hinge(152, 138)}${hinge(152, 196)}${hinge(152, 252)}
    <circle cx="84" cy="204" r="5" fill="${INK}"/><circle cx="104" cy="204" r="5" fill="${INK}"/>`;
  const shelfArt = `
    <rect x="210" y="94" width="20" height="24" fill="${TERRA}"/>
    <rect x="234" y="98" width="16" height="20" fill="${SAGE}"/>
    <rect x="254" y="92" width="34" height="26" rx="2" fill="${BUTTER}" stroke="${INK}" stroke-width="2"/>
    <rect x="292" y="100" width="18" height="18" fill="${INK}"/>
    <rect x="196" y="118" width="140" height="9" rx="4" fill="${WOOD}"/>
    <rect x="242" y="134" width="46" height="24" rx="2" fill="#fffdf6" stroke="${INK}" stroke-width="2"/>
    <rect x="294" y="138" width="16" height="20" fill="${TERRA}"/>
    <rect x="314" y="142" width="18" height="16" fill="${SAGE}"/>
    <circle cx="346" cy="140" r="6" fill="${TERRA}"/><line x1="346" y1="146" x2="346" y2="158" stroke="${SAGE_D}" stroke-width="2.5"/>
    <rect x="228" y="158" width="140" height="9" rx="4" fill="${WOOD}"/>`;
  const deskArt = `
    <ellipse cx="282" cy="${BASE + 3}" rx="92" ry="7" fill="${INK}" opacity="0.14"/>
    <rect x="216" y="192" width="46" height="34" rx="2" fill="#fffdf6" stroke="${INK}" stroke-width="2" transform="rotate(-4 216 192)"/>
    <rect x="268" y="196" width="46" height="30" rx="2" fill="${BUTTER}" stroke="${INK}" stroke-width="2" transform="rotate(3 268 196)"/>
    <rect x="320" y="190" width="14" height="38" rx="3" fill="${TERRA}"/>
    <rect x="196" y="226" width="172" height="14" rx="4" fill="${WOOD}"/>
    <rect x="208" y="240" width="12" height="${BASE - 240}" fill="${WOOD_D}"/>
    <rect x="344" y="240" width="12" height="${BASE - 240}" fill="${WOOD_D}"/>
    <rect x="208" y="272" width="148" height="8" fill="${WOOD_D}" opacity="0.55"/>`;
  const windowArt = `
    <rect x="386" y="92" width="104" height="116" rx="6" fill="${INK}"/>
    <rect x="393" y="99" width="90" height="102" rx="3" fill="#bcd3dd"/>
    <circle cx="416" cy="122" r="11" fill="${BUTTER}"/>
    <rect x="393" y="164" width="90" height="37" fill="${SAGE}"/>
    <line x1="438" y1="99" x2="438" y2="201" stroke="${INK}" stroke-width="5"/>
    <line x1="393" y1="150" x2="483" y2="150" stroke="${INK}" stroke-width="5"/>
    <rect x="380" y="208" width="116" height="9" rx="4" fill="${WOOD}"/>`;
  const doorArt = `
    <rect x="506" y="88" width="92" height="196" fill="${WOOD_D}"/>
    <rect x="510" y="92" width="84" height="192" fill="${WOOD_D}"/>
    <rect x="518" y="100" width="68" height="184" fill="${WOOD}"/>
    <rect x="528" y="116" width="48" height="66" rx="4" fill="none" stroke="${WOOD_D}" stroke-width="3"/>
    ${hinge(510, 122)}${hinge(510, 184)}${hinge(510, 246)}
    <circle cx="576" cy="198" r="6" fill="${BUTTER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="510" y="278" width="84" height="6" fill="${INK}" opacity="0.35"/>`;
  const plantArt = `
    <ellipse cx="622" cy="${BASE + 3}" rx="19" ry="5" fill="${INK}" opacity="0.14"/>
    <line x1="622" y1="264" x2="622" y2="250" stroke="${SAGE_D}" stroke-width="3"/>
    <line x1="622" y1="264" x2="612" y2="253" stroke="${SAGE_D}" stroke-width="2.5"/>
    <line x1="622" y1="264" x2="632" y2="253" stroke="${SAGE_D}" stroke-width="2.5"/>
    <circle cx="622" cy="242" r="11" fill="${SAGE}"/>
    <circle cx="612" cy="251" r="7.5" fill="${SAGE_D}"/>
    <circle cx="632" cy="251" r="7" fill="${SAGE}"/>
    <rect x="608" y="262" width="28" height="8" rx="2" fill="${WOOD_D}"/>
    <polygon points="610,270 634,270 631,${BASE} 613,${BASE}" fill="${TERRA}"/>`;

  el.innerHTML = `
  <div class="room-card">
    <svg viewBox="0 0 640 400" role="group" aria-label="Interactive room. Wardrobe left, desk and shelf centre, window and door right, stereo speakers above.">
      <defs>
        <linearGradient id="shL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#20302a" stop-opacity="0.20"/><stop offset="1" stop-color="#20302a" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="shR" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stop-color="#20302a" stop-opacity="0.20"/><stop offset="1" stop-color="#20302a" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="shF" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#20302a" stop-opacity="0"/><stop offset="1" stop-color="#20302a" stop-opacity="0.14"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="640" height="284" fill="${WALLS[decor.wall]}"/>
      <polygon points="0,284 640,284 640,400 0,400" fill="${FLOOR}"/>
      <polygon points="0,0 44,0 44,284 0,284" fill="url(#shL)"/>
      <polygon points="640,0 596,0 596,284 640,284" fill="url(#shR)"/>
      <rect x="0" y="284" width="640" height="116" fill="url(#shF)"/>
      <line x1="70" y1="284" x2="30" y2="400" stroke="${INK}" stroke-width="2" opacity="0.07"/>
      <line x1="570" y1="284" x2="610" y2="400" stroke="${INK}" stroke-width="2" opacity="0.07"/>
      <rect x="0" y="276" width="640" height="8" fill="${WOOD_D}" opacity="0.5"/>
      <ellipse cx="300" cy="354" rx="158" ry="24" fill="${TEAL}" opacity="0.5"/>
      <ellipse cx="300" cy="354" rx="118" ry="16" fill="none" stroke="${TEAL}" stroke-width="2" opacity="0.65"/>
      <polygon points="502,290 600,290 608,308 494,308" fill="#3d6e7d"/>
      ${plantArt}
      ${hotspot('clatter', 'Left stereo speaker — optional sounds', 12, 6, 52, 68, speakerArt(18))}
      ${hotspot('clatter', 'Right stereo speaker — optional sounds', 570, 6, 52, 68, speakerArt(576))}
      ${decor.poster !== 'none' ? hotspot('decor', 'Wall poster — customize the wall', 218, 20, 128, 68, posterArt(decor)) : ''}
      ${hotspot('wardrobe', 'Wardrobe — clothes and outfits', 24, 102, 140, 192, wardrobeArt)}
      ${hotspot('storage', 'Shelves — find stored items', 190, 88, 184, 82, shelfArt)}
      ${hotspot('desk', 'Desk — saved notes and screenshots', 190, 184, 184, 110, deskArt)}
      ${hotspot('timeline', 'Window into the day — open timeline', 380, 86, 118, 132, windowArt)}
      ${hotspot('doorway', 'Doorway — prepare to leave', 502, 84, 100, 200, doorArt)}
      ${inbox > 0 ? dot(366, 192, TERRA) : ''}
      ${remaining > 0 ? dot(586, 104, TERRA) : ''}
      ${ready ? dot(586, 104, SAGE_D) : ''}
    </svg>
  </div>`;

  el.querySelectorAll<SVGGElement>('.room-hotspot').forEach((g) => {
    const area = g.dataset.area as Area;
    g.addEventListener('click', () => onOpen(area));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onOpen(area);
      }
    });
  });

  // The card is taller than the 640×400 scene on wide screens. The SVG is
  // centred (meet), so extend the wall colour above the scene and the floor
  // colour below it — the room then fills the frame top to bottom with no
  // cropping and no distortion of the furniture or hotspots.
  const card = el.querySelector<HTMLElement>('.room-card')!;
  const svg = card.querySelector('svg')!;
  const paint = () => {
    const w = svg.clientWidth, h = svg.clientHeight;
    if (!w || !h) return;
    const scale = Math.min(w / 640, h / 400);
    const wallBottom = (h - 400 * scale) / 2 + 284 * scale;
    card.style.background = `linear-gradient(to bottom, ${WALLS[decor.wall]} 0 ${wallBottom}px, ${FLOOR} ${wallBottom}px 100%)`;
  };
  paint();
  painters.get(el)?.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(paint);
    ro.observe(svg);
    painters.set(el, ro);
  }
}
