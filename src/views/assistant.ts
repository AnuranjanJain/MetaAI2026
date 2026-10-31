// Voice assistant sheet: talk → intent → (voice slot-filling) → the same
// editable confirm card the desk uses → spoken read-back. Nothing is created
// or completed from voice alone; every mutation waits for a tap on Confirm.

import { store } from '../store.js';
import { createId, nowIso } from '../core/model.js';
import { applySlotAnswer, missingSlots, propose, searchBelongings, DEMO_LABEL, type ProposalSlot } from '../core/inference.js';
import { classifyIntent, summarizeCreated, summarizeProposal, whereAnswer } from '../core/assistant.js';
import { listenOnce, speak, speakAndWait, stopSpeak } from '../voice.js';
import { showProposal } from './areas/desk.js';
import { nextCommitment } from './room.js';
import { esc, lastStored, type Ui } from '../shell.js';
import type { Capture, Proposal } from '../core/types.js';

let sessionSeq = 0;

const SLOT_PROMPTS: Record<ProposalSlot, (p: Proposal) => string> = {
  date: (p) => `What date is ${p.title}?`,
  time: (p) => `What time does ${p.title} start?`,
  duration: (p) => `How long should ${p.title} take?`,
};

export function openAssistant(sheetRoot: HTMLElement, ui: Ui): void {
  const session = ++sessionSeq;
  document.body.classList.add('sheet-open');
  stopSpeak();
  sheetRoot.innerHTML = `
    <div class="sheet-scrim" data-close="1"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Voice assistant">
      <div class="sheet-head"><h2>Voice assistant</h2>
      <button class="btn soft small" data-close="1">← Back</button></div>
    </div>`;
  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.innerHTML = `
    <p class="meta">Say a task, event, or thing to remember — e.g. “Dentist tomorrow at
      2:30 pm”, “Buy batteries, 20 minutes”, or “Where is my adapter?”.
      You always confirm before anything is saved. ${esc(DEMO_LABEL)}.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="btn plain" id="as-start">🎙️ Start listening</button>
      <button class="btn soft" id="as-desk">Type instead</button>
    </div>
    <p class="meta" id="as-status" aria-live="polite" style="margin-top:12px">Ready when you are.</p>
    <div id="proposal"></div>`;
  sheetRoot.querySelector('.sheet')!.appendChild(body);

  const alive = () => session === sessionSeq && body.isConnected;
  const close = () => {
    if (session === sessionSeq) sessionSeq++;
    stopSpeak();
    sheetRoot.innerHTML = '';
    document.body.classList.remove('sheet-open');
  };
  sheetRoot.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  body.querySelector('#as-desk')!.addEventListener('click', () => { close(); ui.open('desk', { focusAdd: true }); });
  body.querySelector('#as-start')!.addEventListener('click', () => void run(body, ui, alive, close));
  (sheetRoot.querySelector('.sheet-head button') as HTMLButtonElement).focus();
}

function setStatus(body: HTMLElement, text: string): void {
  const el = body.querySelector('#as-status');
  if (el) el.textContent = text;
}

async function run(
  body: HTMLElement, ui: Ui,
  alive: () => boolean, close: () => void,
): Promise<void> {
  const start = body.querySelector<HTMLButtonElement>('#as-start')!;
  start.disabled = true;
  setStatus(body, 'Listening… say it in one sentence.');
  const heard = await listenOnce({});
  if (!alive()) return;
  start.disabled = false;
  if (!heard) {
    setStatus(body, 'Did not catch that — tap Start listening to try again, or type instead.');
    ui.toast('Did not catch that — try typing instead.');
    return;
  }

  const intent = classifyIntent(heard, store.state);

  if (intent.kind === 'next') {
    const next = nextCommitment(store.state);
    const answer = next ? `Next up: ${next}.` : 'Nothing else is scheduled today.';
    setStatus(body, answer);
    speak(answer);
    return;
  }

  if (intent.kind === 'where') {
    const hits = searchBelongings(intent.query, store.state.belongings, store.state.locations).slice(0, 3);
    const host = body.querySelector('#proposal')!;
    host.innerHTML = hits.length
      ? `<div class="card"><h3>Here’s what I have</h3><ul class="clean">${hits.map((h) => `
          <li><strong>${esc(h.belonging.name)}</strong><br/><span class="loc-note">${esc(lastStored(store.state, h.belonging.id))}</span></li>`).join('')}</ul></div>`
      : `<div class="card"><h3>Not recorded yet</h3><p class="meta">No stored item matches “${esc(intent.query)}”.</p></div>`;
    setStatus(body, whereAnswer(intent.query, store.state));
    speak(whereAnswer(intent.query, store.state));
    return;
  }

  if (intent.kind === 'done') {
    const host = body.querySelector('#proposal')!;
    host.innerHTML = `
      <div class="card" style="border-color:var(--terra)"><h3>Mark done?</h3>
        <p>“${esc(intent.title)}”</p>
        <div class="row"><button class="btn plain" id="as-done-yes">Yes, mark done</button>
        <button class="btn soft" id="as-done-no">Cancel</button></div></div>`;
    setStatus(body, `I found the task “${intent.title}”. Confirm to mark it done.`);
    host.querySelector('#as-done-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-done-yes')!.addEventListener('click', () => {
      store.update((d) => {
        const t = d.tasks.find((x) => x.id === intent.taskId);
        if (t) { t.done = true; t.updatedAt = nowIso(); }
      });
      ui.sound('done');
      ui.toast('Task done. Nice.', { action: 'Undo', onAction: () => store.undo() });
      speak(`Done: ${intent.title}.`);
      host.innerHTML = '';
      setStatus(body, `Marked “${intent.title}” done.`);
    });
    return;
  }

  if (intent.kind === 'unknown') {
    setStatus(body, 'I heard you, but there was nothing to save. Try again.');
    return;
  }

  // add: keep the spoken source as an auditable capture, exactly like typing.
  const capture: Capture = {
    id: createId('cap'), kind: 'note', text: intent.text,
    name: intent.text.slice(0, 48), status: 'inbox', createdAt: nowIso(),
  };
  store.update((d) => { d.captures.push(capture); });
  let p = propose(intent.text, false);
  setStatus(body, summarizeProposal(p));

  for (const slot of missingSlots(p)) {
    if (!alive()) return;
    const prompt = SLOT_PROMPTS[slot](p);
    setStatus(body, prompt);
    await speakAndWait(prompt);
    if (!alive()) return;
    setStatus(body, 'Listening for your answer… (say “skip” to fill it in by hand)');
    const answer = await listenOnce({});
    if (!alive()) return;
    if (answer && !/^skip\b/i.test(answer)) p = applySlotAnswer(p, slot, answer);
  }
  if (!alive()) return;
  setStatus(body, summarizeProposal(p));
  showProposal(body, ui, capture.id, {
    proposal: p,
    onFinished: (final, outcome) => {
      if (outcome === 'confirmed') speak(summarizeCreated(final));
      close();
    },
  });
}
