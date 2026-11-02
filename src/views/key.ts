// Shared BYOK key widget: password input, Save/Test/Clear, status line.
// Rendered inline wherever live features need a key (assistant, wardrobe).
// The key value is never displayed back once saved.

import { clearKey, getKey, hasKey, setKey, validateKey } from '../core/byok.js';
import { clearOpenKey, getOpenKey, getProvider, hasOpenKey, setOpenKey, setProvider, validateOpenKey, OPEN_MODEL } from '../core/openweights.js';
import { type Ui } from '../shell.js';

export function keyFieldHtml(idp: string): string {
  const saved = hasKey();
  return `<details class="key-card">
    <summary>🔑 Use my own Muse key${saved ? ' · key saved ✓' : ''}</summary>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <input type="password" class="key-input" id="${idp}-key" placeholder="Paste Muse API key" autocomplete="off" spellcheck="false" style="flex:2;min-width:160px" aria-label="Muse API key" />
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

export function openKeyFieldHtml(idp: string): string {
  const saved = hasOpenKey();
  const provider = getProvider();
  return `<details class="key-card">
    <summary>🔑 Open-weights chat: Muse Spark Open on Baseten${saved ? ' · key saved ✓' : ''}</summary>
    <p class="meta">Runs intent + Captain chats on <code>${OPEN_MODEL}</code>
    via Baseten with your key. Vision, transcribe, and dream stay on Meta.
    Falls back to your Meta key, then the proxy, then local.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px" role="radiogroup" aria-label="Chat backend">
      <label class="pick"><input type="radio" name="${idp}-provider" value="meta" ${provider === 'meta' ? 'checked' : ''} /> Meta Spark</label>
      <label class="pick"><input type="radio" name="${idp}-provider" value="open" ${provider === 'open' ? 'checked' : ''} /> Spark Open</label>
    </div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <input type="password" class="key-input" id="${idp}-openkey" placeholder="Paste Baseten API key" autocomplete="off" spellcheck="false" style="flex:2;min-width:160px" aria-label="Baseten API key" />
    </div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
      <button class="btn soft small" id="${idp}-openkey-save">Save key</button>
      <button class="btn soft small" id="${idp}-openkey-test">Test key</button>
      <button class="btn soft small" id="${idp}-openkey-clear">Clear</button>
    </div>
    <p class="meta" id="${idp}-openkey-status">${saved ? 'Key saved in this browser.' : 'No key saved.'} Stored only in this browser — never shown back, never committed.</p>
  </details>`;
}

export function wireOpenKeyField(body: HTMLElement, ui: Ui, idp: string, onChange: () => void): void {
  const input = body.querySelector<HTMLInputElement>(`#${idp}-openkey`);
  const status = body.querySelector(`#${idp}-openkey-status`);
  if (!input || !status) return;
  const say = (t: string) => { status.textContent = t; };
  body.querySelectorAll<HTMLInputElement>(`input[name="${idp}-provider"]`).forEach((r) =>
    r.addEventListener('change', () => {
      setProvider(r.value === 'open' ? 'open' : 'meta');
      onChange();
    }));
  body.querySelector(`#${idp}-openkey-save`)?.addEventListener('click', () => {
    const v = input.value.trim();
    if (!v) { say('Paste a key first.'); return; }
    setOpenKey(v);
    input.value = '';
    ui.toast('Baseten key saved in this browser.');
    onChange();
  });
  body.querySelector(`#${idp}-openkey-clear`)?.addEventListener('click', () => {
    clearOpenKey();
    input.value = '';
    ui.toast('Baseten key cleared.');
    onChange();
  });
  body.querySelector(`#${idp}-openkey-test`)?.addEventListener('click', async () => {
    const v = input.value.trim() || getOpenKey() || '';
    if (!v) { say('Paste a key first.'); return; }
    say('Testing…');
    const result = await validateOpenKey(v);
    if (!body.isConnected) return;
    say(result === 'ok'
      ? 'Key works.'
      : result === 'rejected'
        ? 'Key rejected — check it and try again.'
        : 'Could not reach Baseten.');
  });
}
