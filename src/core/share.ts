// Share + poster: pure day summaries, SVG poster, and X intent links.
// No model calls here — the poster is an honest on-device SVG fallback.
// A Muse Image route would slot in as an optional upgrade (see HACKATHON.md).

import { todayKey } from './model.js';
import type { AppState } from './types.js';

export interface DayVibe {
  headline: string;
  occasion: string;
  tasksOpen: number;
  tasksDone: number;
  events: number;
  inbox: number;
  streak: number;
}

/** One-line day summary from real counts. Pure. */
export function dayVibe(state: AppState, date: string): DayVibe {
  const dayEvents = state.events.filter((e) => e.date === date);
  const tasksOpen = state.tasks.filter((t) => !t.done).length;
  const tasksDone = state.tasks.filter((t) => t.done && t.updatedAt.slice(0, 10) === date).length;
  const inbox = state.captures.filter((c) => c.status === 'inbox').length;
  const streak = state.streak?.count ?? 0;
  const first = dayEvents[0]?.title ?? '';
  const occasion = /gym|workout|run/i.test(first) ? 'active'
    : /lecture|class|exam|study/i.test(first) ? 'focused'
    : /dinner|party|date/i.test(first) ? 'social'
    : dayEvents.length ? 'full' : tasksOpen ? 'maker' : 'calm';
  const headline = dayEvents.length === 0 && tasksOpen === 0
    ? 'A clear day'
    : dayEvents.length >= 3 ? 'A full, good day'
    : tasksOpen >= 5 ? 'A maker day'
    : first ? first : 'Today, handled';
  return { headline, occasion, tasksOpen, tasksDone, events: dayEvents.length, inbox, streak };
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Fit one SVG line into maxPx: shrink the font toward minSize, then
    ellipsize past maxChars (0 = no cap). SVG text never wraps, so every
    user-words line on the poster goes through here. Pure. */
export function fitLine(text: string, maxPx: number, baseSize: number, minSize: number, factor = 0.6, maxChars = 0): { text: string; fontSize: number } {
  const clean = text.trim();
  const t = maxChars > 0 && clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
  const fontSize = Math.max(minSize, Math.min(baseSize, Math.floor(maxPx / (factor * (t.length || 1)))));
  return { text: t, fontSize };
}

/** 600×800 day poster as standalone SVG. Uses the app palette; every word
    comes from the user's own day — nothing invented. */
export function posterSvg(state: AppState, date: string): string {
  const vibe = dayVibe(state, date);
  const dayEvents = state.events
    .filter((e) => e.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);
  const eventRows = dayEvents.map((e, i) => {
    const y = 380 + i * 54;
    const row = fitLine(`${e.start} · ${e.title.slice(0, 28)}`, 480, 22, 15);
    return `<text x="60" y="${y}" font-size="${row.fontSize}" fill="#20302a" font-family="Georgia,serif">${escXml(row.text)}</text>`;
  }).join('');
  const stats = fitLine(
    `${vibe.tasksOpen} open · ${vibe.tasksDone} done · ${vibe.inbox} on desk`
    + (vibe.streak ? ` · ${vibe.streak}-day streak` : ''),
    480, 24, 16);
  const head = fitLine(vibe.headline, 480, 52, 30, 0.6, 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">`
    + `<rect width="600" height="800" rx="28" fill="#f3edde"/>`
    + `<rect x="24" y="24" width="552" height="752" rx="20" fill="#fbf7ec" stroke="#e0d5bd" stroke-width="2"/>`
    + `<text x="60" y="110" font-size="30" fill="#57705d" font-family="Georgia,serif">Pocketroom · ${escXml(date)}</text>`
    + `<text x="60" y="180" font-size="${head.fontSize}" font-weight="bold" fill="#20302a" font-family="Georgia,serif">${escXml(head.text)}</text>`
    + `<text x="60" y="225" font-size="24" fill="#43544c" font-family="system-ui,sans-serif">a ${escXml(vibe.occasion)} day, in one little place</text>`
    + `<rect x="60" y="260" width="480" height="2" fill="#e0d5bd"/>`
    + `<text x="60" y="310" font-size="${stats.fontSize}" fill="#a5532f" font-family="system-ui,sans-serif">${escXml(stats.text)}</text>`
    + (eventRows || `<text x="60" y="380" font-size="22" fill="#43544c" font-family="Georgia,serif">Nothing fixed — the day is yours.</text>`)
    + `<rect x="60" y="620" width="480" height="90" rx="14" fill="#e7efe4"/>`
    + `<text x="84" y="658" font-size="21" fill="#20302a" font-family="system-ui,sans-serif">Captain-verified: fixed plans untouched,</text>`
    + `<text x="84" y="688" font-size="21" fill="#20302a" font-family="system-ui,sans-serif">every change confirmed by tap.</text>`
    + `<text x="60" y="760" font-size="16" fill="#9db4a0" font-family="system-ui,sans-serif">Pocketroom day poster · on-device SVG · ${escXml(todayKey())}</text>`
    + `</svg>`;
}

/** Short share line with real counts + hackathon tag. Pure. */
export function shareText(state: AppState, date: string): string {
  const vibe = dayVibe(state, date);
  const bits = [
    `${vibe.events} event(s)`,
    `${vibe.tasksOpen} open task(s)`,
    `${vibe.tasksDone} done`,
    vibe.inbox ? `${vibe.inbox} on desk` : 'inbox zero',
  ];
  const streak = vibe.streak ? ` Captain streak: ${vibe.streak}d.` : '';
  return `My Pocketroom today (${date}): ${bits.join(', ')}.${streak} Planned with Morning Captain + Muse. #BuildForYourWorld`;
}

/** X intent link for the share text. Pure. */
export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
