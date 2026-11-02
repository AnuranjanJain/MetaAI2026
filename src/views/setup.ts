// AI setup: the ONE place for keys, backend, and Live status.
// Every AI feature (assistant, Captain, wardrobe, dream, desk) reads from
// here — no other screen asks for keys.

import { hasKey } from '../core/byok.js';
import { liveBadge, liveModeEnabled, proxyConfigured, setLiveMode } from '../core/liveModel.js';
import { getProvider, hasOpenKey } from '../core/openweights.js';
import { keyFieldHtml, openKeyFieldHtml, wireKeyField, wireOpenKeyField } from './key.js';
import { esc, type Ui } from '../shell.js';

let seq = 0;

export function openKeys(sheetRoot: HTMLElement, ui: Ui): void {
  const session = ++seq;
  document.body.classList.add('sheet-open');
  sheetRoot.innerHTML = `
    <div class="sheet-scrim" data-close="1"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="AI setup">
      <div class="sheet-head"><h2>AI setup</h2>
      <button class="btn soft small" data-close="1">← Back</button></div>
    </div>`;
  const alive = () => session === seq && sheetRoot.isConnected;
  const close = () => {
    if (session === seq) seq++;
    sheetRoot.innerHTML = '';
    document.body.classList.remove('sheet-open');
  };
  sheetRoot.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  const body = document.createElement('div');
  body.className = 'sheet-body';
  const provider = getProvider();
  const rows = [
    `Status: ${liveBadge()}`,
    `Live: ${liveModeEnabled() ? 'on' : 'off'}`,
    `Proxy: ${proxyConfigured() ? 'configured in this build' : 'missing — set VITE_MUSE_PROXY_URL and redeploy'}`,
    `Meta key: ${hasKey() ? 'saved in this browser' : 'not set'}`,
    `Baseten key: ${hasOpenKey() ? 'saved in this browser' : 'not set'}`,
    `Chat backend: ${provider === 'open' ? 'Spark Open (Baseten)' : 'Muse Spark (Meta)'}`,
  ];
  body.innerHTML = `
    <div class="card"><ul class="clean">${rows.map((r) => `<li class="meta">${esc(r)}</li>`).join('')}</ul>
    <p><button class="btn soft small" id="keys-live">Live: ${liveModeEnabled() ? 'on' : 'off'}</button></p></div>
    ${keyFieldHtml('keys')}
    ${openKeyFieldHtml('keys')}
    <p class="meta">Routing: your keys → proxy → on-device fallback, always
    labeled per result. Vision, transcribe, and dream use Meta; intent and
    Captain chats follow the backend above.</p>`;
  sheetRoot.querySelector('.sheet')!.appendChild(body);
  body.querySelector('#keys-live')!.addEventListener('click', () => {
    if (!alive()) return;
    setLiveMode(!liveModeEnabled());
    openKeys(sheetRoot, ui);
  });
  const refresh = (): void => { if (alive()) openKeys(sheetRoot, ui); };
  wireKeyField(body, ui, 'keys', refresh);
  wireOpenKeyField(body, ui, 'keys', refresh);
  (sheetRoot.querySelector('.sheet-head button') as HTMLButtonElement).focus();
}
