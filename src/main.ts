// Pocketroom entry point: boot the shell into #app.

import { Shell } from './shell.js';

const shell = new Shell();
shell.start();

// Offline shell in production builds only — dev stays network-fresh.
const prod = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;
if (prod && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
