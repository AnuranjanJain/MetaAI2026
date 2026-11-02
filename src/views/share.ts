// Share view: poster preview, SVG/PNG downloads, Post to X, copy text.
// Canvas PNG is drawn from the same counts as the SVG — no hidden assets.

import { store } from '../store.js';
import { todayKey } from '../core/model.js';
import { dayVibe, posterSvg, shareText, xIntentUrl } from '../core/share.js';
import { dreamWords } from '../core/dream.js';
import { dreamDirect, dreamViaMuse, liveModeEnabled } from '../core/liveModel.js';
import { getKey, hasKey } from '../core/byok.js';
import { esc, noteHtml, type Ui } from '../shell.js';

export function renderShare(body: HTMLElement, ui: Ui, date: string): void {
  const s = store.state;
  const vibe = dayVibe(s, date);
  const text = shareText(s, date);
  const svg = posterSvg(s, date);
  body.innerHTML = `
    <p class="meta">${esc(vibe.headline)} — ${vibe.events} event(s), ${vibe.tasksOpen} open, ${vibe.tasksDone} done.</p>
    <div id="sh-poster" class="poster-frame">${svg}</div>
    <div id="sh-dream-note">${noteHtml('demo', 'Print', 'On-device SVG poster above. Dream one with Muse Image instead — explicit tap, your day words only.')}</div>
    <p class="row" style="flex-wrap:wrap;gap:8px;margin-top:10px">
      <button class="btn plain small" id="sh-png">Download card (PNG)</button>
      <button class="btn soft small" id="sh-svg">Poster (SVG)</button>
      <button class="btn soft small" id="sh-dream">Dream poster (Muse Image)</button>
      <a class="btn soft small" id="sh-x" href="${xIntentUrl(text)}" target="_blank" rel="noopener">Post to X</a>
      <button class="btn soft small" id="sh-copy">Copy text</button>
    </p>
    <p class="meta">Post your demo with #BuildForYourWorld before Nov 8 EOD for Most Viral.</p>`;
  body.querySelector('#sh-svg')!.addEventListener('click', () => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, `pocketroom-${date}.svg`);
    ui.toast('Poster downloaded.');
  });
  body.querySelector('#sh-png')!.addEventListener('click', () => {
    try {
      const url = drawSharePng(date);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pocketroom-${date}.png`;
      a.click();
      ui.toast('Share card downloaded.');
    } catch {
      ui.toast('PNG failed on this browser — SVG works everywhere.');
    }
  });
  body.querySelector('#sh-copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('Share text copied.');
    } catch {
      ui.toast(text);
    }
  });
  body.querySelector('#sh-dream')!.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#sh-dream')!;
    const note = body.querySelector('#sh-dream-note')!;
    const frame = body.querySelector('#sh-poster')!;
    btn.disabled = true;
    note.innerHTML = noteHtml('live', 'Muse on', 'Dreaming with Muse Image… (up to a minute)');
    try {
      const words = dreamWords(store.state, date);
      const out = hasKey()
        ? await dreamDirect(words, getKey() ?? '')
        : liveModeEnabled() ? await dreamViaMuse(words) : null;
      if (!body.isConnected) return;
      if (!out) {
        note.innerHTML = noteHtml('demo', 'Demo', 'Dream unavailable — the SVG poster above still works. Check Live status or your key.');
        ui.toast('Muse Image unavailable right now.');
        return;
      }
      frame.innerHTML = `<img src="${out.image}" alt="Dreamed day poster" />`;
      note.innerHTML = noteHtml('live', out.direct ? 'Muse key' : 'Muse on', `Dreamed by Muse Image • ${Math.round(out.latencyMs / 1000)}s. Right-click / long-press to save.`);
      ui.toast('Dream poster ready.');
    } catch {
      if (body.isConnected) note.innerHTML = noteHtml('demo', 'Demo', 'Dream hiccuped — the SVG poster above still works.');
    } finally {
      if (body.isConnected) btn.disabled = false;
    }
  });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 1080×1350 share card drawn from live counts. Phone-safe 2D canvas. */
export function drawSharePng(date: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const g = canvas.getContext('2d')!;
  const s = store.state;
  const vibe = dayVibe(s, date);
  g.fillStyle = '#f3edde';
  g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#fbf7ec';
  g.fillRect(48, 48, 984, 1254);
  g.fillStyle = '#57705d';
  g.font = '44px Georgia, serif';
  g.fillText(`Pocketroom · ${date}`, 100, 160);
  g.fillStyle = '#20302a';
  g.font = 'bold 84px Georgia, serif';
  g.fillText(vibe.headline.slice(0, 22), 100, 270);
  g.fillStyle = '#43544c';
  g.font = '40px system-ui, sans-serif';
  g.fillText(`a ${vibe.occasion} day, in one little place`, 100, 340);
  g.fillStyle = '#e0d5bd';
  g.fillRect(100, 390, 880, 3);
  g.fillStyle = '#a5532f';
  g.font = '42px system-ui, sans-serif';
  g.fillText(`${vibe.tasksOpen} open · ${vibe.tasksDone} done · ${vibe.inbox} on desk`, 100, 470);
  const events = s.events.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
  g.fillStyle = '#20302a';
  g.font = '40px Georgia, serif';
  events.forEach((e, i) => {
    g.fillText(`${e.start} · ${e.title.slice(0, 30)}`, 100, 570 + i * 70);
  });
  if (!events.length) g.fillText('Nothing fixed — the day is yours.', 100, 570);
  g.fillStyle = '#e7efe4';
  g.fillRect(100, 1050, 880, 130);
  g.fillStyle = '#20302a';
  g.font = '36px system-ui, sans-serif';
  g.fillText('Captain-verified: fixed plans untouched,', 140, 1105);
  g.fillText('every change confirmed by tap.', 140, 1155);
  if (vibe.streak) {
    g.fillStyle = '#57705d';
    g.fillText(`${vibe.streak}-day Captain streak`, 100, 1260);
  }
  return canvas.toDataURL('image/png');
}

// Re-exported for tests that only need pure helpers via core/share.
export { todayKey };
