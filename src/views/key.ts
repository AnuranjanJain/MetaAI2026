// Shared BYOK key widget: password input, Save/Test/Clear, status line.
// Rendered inline wherever live features need a key (assistant, wardrobe).
// The key value is never displayed back once saved.

import { clearKey, getKey, hasKey, setKey, validateKey } from '../core/byok.js';
import { type Ui } from '../shell.js';

export function keyFieldHtml(idp: string): string {
  const saved = hasKey();
  return `<details style="margin-top:8px">
    <summary>Use my own Muse key${saved ? ' (key saved)' : ''}</summary>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <input type="password" id="${idp}-key" placeholder="Paste Muse API key" autocomplete="off" spellcheck="false" style="flex:2;min-width:160px" aria-label="Muse API key" />
    </div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <button class="btn soft small" id="${idp}-key-save">Save key</button>
      <button class="btn soft small" id="${idp}-key-test">Test key</button>
      <button class="btn soft small" id="${idp}-key-clear">Clear</button>
    </div>
    <p class="meta" id="${idp}-key-status">${saved ? 'Key saved in this browser.' : 'No key saved.'} Stored only in this browser — never shown back, never committed. Clear it on shared devices.</p>
  </details>`;
}

export function wireKeyField(body: HTMLElement, ui: Ui, idp: string, onChange: () => void): void {
  const input = body.querySelector<HTMLInputElement>(`#${idp}-key`);
  const status = body.querySelector(`#${idp}-key-status`);
  if (!input || !status) return;
  const say = (t: string) => { status.textContent = t; };
  body.querySelector(`#${idp}-key-save`)?.addEventListener('click', () => {
    const v = input.value.trim();
    if (!v) { say('Paste a key first.'); return; }
    setKey(v);
    input.value = '';
    ui.toast('Key saved in this browser.');
    onChange();
  });
  body.querySelector(`#${idp}-key-clear`)?.addEventListener('click', () => {
    clearKey();
    input.value = '';
    ui.toast('Key cleared.');
    onChange();
  });
  body.querySelector(`#${idp}-key-test`)?.addEventListener('click', async () => {
    const v = input.value.trim() || getKey() || '';
    if (!v) { say('Paste a key first.'); return; }
    say('Testing…');
    const result = await validateKey(v);
    if (!body.isConnected) return;
    say(result === 'ok'
      ? 'Key works.'
      : result === 'rejected'
        ? 'Key rejected — check it and try again.'
        : 'Could not reach the Muse API.');
  });
}
