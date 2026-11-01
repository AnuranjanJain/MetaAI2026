// Voice assistant: talk → intent → slot-filling → desk confirm card → read-back.
// Mutations wait for Confirm by tap, or spoken “yes” in opt-in Hands-free mode.
// Hands-free clicks the same buttons a tap would; it never invents a save path.

import { store } from '../store.js';
import { buildChecklistForEvent, createId, nowIso, todayKey } from '../core/model.js';
import { applySlotAnswer, missingSlots, propose, searchBelongings, DEMO_LABEL, type ProposalSlot } from '../core/inference.js';
import { deskSummary, findRenamable, haveAnswer, matchEvent, matchRoutine, summarizeCreated, summarizeProposal, wardrobeAnswer, wearPick, whereAnswer } from '../core/assistant.js';
import { DIRECT_INTRO, DIRECT_LABEL, LIVE_INTRO, LIVE_LABEL, liveModeActive, resolveIntent } from '../core/liveModel.js';
import { hasKey } from '../core/byok.js';
import { handsFreeEnabled, isConversationEnd, micErrorMessage, setHandsFree, speak, speakAndWait, startListeningUntilDone, stopSpeak, stripConversationEnd, voiceConfirm, type ListeningSession } from '../voice.js';
import { keyFieldHtml, wireKeyField } from './key.js';
import { showProposal } from './areas/desk.js';
import { nextCommitment } from './room.js';
import { esc, lastStored, type Ui } from '../shell.js';
import type { Capture, Proposal } from '../core/types.js';

let sessionSeq = 0;
let activeSession: ListeningSession | null = null;
let nullStreak = 0, stopAfterTurn = false;

const SLOT_PROMPTS: Record<ProposalSlot, (p: Proposal) => string> = {
  date: (p) => `What date is ${p.title}?`, time: (p) => `What time does ${p.title} start?`,
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
  const modeNote = hasKey() ? DIRECT_INTRO : liveModeActive() ? LIVE_INTRO : DEMO_LABEL;
  body.innerHTML = `<p class="meta">Say a task, event, or thing to remember — e.g. “Dentist tomorrow at 2:30 pm”, “Buy batteries, 20 minutes”, or “Where is my adapter?”. You always confirm before anything is saved — by tap, or by voice when Hands-free is on. ${esc(modeNote)}.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn plain" id="as-start">🎙️ Start listening</button><button class="btn soft" id="as-desk">Type instead</button><button class="btn soft" id="as-handsfree">Hands-free: off</button></div>
    ${keyFieldHtml('as')}
    <p class="meta" id="as-status" aria-live="polite" style="margin-top:12px">Ready when you are.</p><div id="proposal"></div>`;
  sheetRoot.querySelector('.sheet')!.appendChild(body);

  const hf = body.querySelector<HTMLButtonElement>('#as-handsfree')!;
  const paintHf = () => { hf.textContent = `Hands-free: ${handsFreeEnabled() ? 'on' : 'off'}`; };
  paintHf();
  let busy = false, stopLoop = false;
  const startBtn = body.querySelector<HTMLButtonElement>('#as-start')!;
  const reportCrash = (e: unknown, hint: string): void => {
    console.error('assistant turn failed', e);
    if (!alive()) return;
    const detail = e instanceof Error && e.message ? `: ${e.message.slice(0, 120)}` : '';
    setStatus(body, `Something went wrong${detail} — ${hint}`);
  };
  const conversationLoop = async (): Promise<void> => {
    if (busy) return;
    busy = true; stopLoop = false;
    try {
      while (alive() && handsFreeEnabled() && !stopLoop) {
        startBtn.textContent = '⏹ Stop';
        let outcome: 'stop' | undefined;
        try {
          outcome = await run(body, ui, alive, close);
        } catch (e) {
          reportCrash(e, 'tap ⏹ Stop, then Start listening.');
          break;
        }
        if (outcome === 'stop' || stopAfterTurn) { stopAfterTurn = false; break; }
      }
    } finally { busy = false; if (body.isConnected) startBtn.textContent = '🎙️ Start listening'; }
  };
  hf.addEventListener('click', () => {
    setHandsFree(!handsFreeEnabled()); paintHf();
    setStatus(body, handsFreeEnabled() ? 'Hands-free on: I’ll keep listening until “that’s it for now” or ⏹ Stop.' : 'Hands-free off: tap to confirm, as before.');
    if (handsFreeEnabled() && !busy) void conversationLoop();
  });

  const alive = () => session === sessionSeq && body.isConnected;
  const close = () => {
    if (session === sessionSeq) sessionSeq++;
    activeSession?.cancel(); activeSession = null; stopSpeak();
    sheetRoot.innerHTML = ''; document.body.classList.remove('sheet-open');
  };
  sheetRoot.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  body.querySelector('#as-desk')!.addEventListener('click', () => { close(); ui.open('desk', { focusAdd: true }); });
  startBtn.addEventListener('click', () => {
    if (activeSession) { activeSession.stop(); return; }
    if (busy) { stopLoop = true; return; }
    if (handsFreeEnabled()) void conversationLoop();
    else {
      busy = true;
      void run(body, ui, alive, close)
        .catch((e) => reportCrash(e, 'try again, or type instead.'))
        .finally(() => { busy = false; });
    }
  });
  wireKeyField(body, ui, 'as', () => openAssistant(sheetRoot, ui));
  if (handsFreeEnabled()) void conversationLoop();
  (sheetRoot.querySelector('.sheet-head button') as HTMLButtonElement).focus();
}

function setStatus(body: HTMLElement, text: string): void {
  const el = body.querySelector('#as-status');
  if (el) el.textContent = text.length > 220 ? text.slice(0, 220) + '…' : text;
}

/** Hands-free confirm: ask aloud, then click the same yes/no button a tap would.
    Await it so the next listen starts only after the spoken answer. */
function offerVoiceConfirm(body: HTMLElement, alive: () => boolean, question: string, yesSel: string, noSel: string): Promise<void> {
  if (!handsFreeEnabled()) return Promise.resolve();
  return (async () => {
    const answer = await voiceConfirm(question);
    if (!alive()) return;
    const yes = body.querySelector<HTMLButtonElement>(yesSel); const no = body.querySelector<HTMLButtonElement>(noSel);
    if (!yes || !no) return;
    if (answer === 'yes') yes.click(); else if (answer === 'no') no.click();
    else setStatus(body, `${question} Say “yes” or “no”, or tap.`);
  })();
}

/** One utterance: Done ends it early; the status previews heard text. In
    hands-free the pause gate is shorter so turns feel continuous. The error
    code names the failure when no text was heard. */
async function listenUtterance(body: HTMLElement, start: HTMLButtonElement, hint: string): Promise<{ text: string | null; error: string | null }> {
  const idleLabel = '🎙️ Start listening';
  const session = startListeningUntilDone({
    silenceMs: handsFreeEnabled() ? 3000 : 5000,
    onInterim: (text) => { if (body.isConnected) setStatus(body, text ? `Heard: “${text}”` : hint); },
  });
  activeSession = session; start.disabled = false; start.textContent = '⏺ Done';
  const out = await session.done;
  // Guarded: a hot-reloaded tab can briefly mix module versions.
  const error = typeof session.lastError === 'function' ? session.lastError() : null;
  activeSession = null;
  if (body.isConnected) { start.textContent = idleLabel; start.disabled = false; }
  return { text: out, error: out ? null : error };
}

/** Read-only lookup card for `where` and the ambiguous follow-up. True if matched. */
function showLookup(body: HTMLElement, query: string): boolean {
  const hits = searchBelongings(query, store.state.belongings, store.state.locations).slice(0, 3);
  const host = body.querySelector('#proposal')!;
  host.innerHTML = hits.length
    ? `<div class="card"><h3>Here’s what I have</h3><ul class="clean">${hits.map((h) => `<li><strong>${esc(h.belonging.name)}</strong><br/><span class="loc-note">${esc(lastStored(store.state, h.belonging.id))}</span></li>`).join('')}</ul></div>`
    : `<div class="card"><h3>Not recorded yet</h3><p class="meta">No stored item matches “${esc(query)}”.</p></div>`;
  return hits.length > 0;
}

async function run(
  body: HTMLElement, ui: Ui,
  alive: () => boolean, close: () => void,
): Promise<'stop' | undefined> {
  const start = body.querySelector<HTMLButtonElement>('#as-start')!;
  const convo = handsFreeEnabled();
  setStatus(body, convo
    ? 'Listening… speak naturally. Say “that’s it for now” to stop, or tap ⏹ Stop.'
    : 'Listening… speak naturally. Tap ⏺ Done, say “that’s it”, or pause ~5 seconds when finished.');
  const t0 = Date.now();
  const first = await listenUtterance(body, start, 'Listening… speak naturally.');
  let heard = first.text;
  if (!alive()) return;
  if (!heard) {
    if (convo && Date.now() - t0 < 5000) nullStreak++; else nullStreak = 0;
    if (convo && nullStreak >= 3) {
      setStatus(body, 'The mic is not responding — tap ⏹ Stop, check permissions, then Start listening.');
      return 'stop';
    }
    setStatus(body, micErrorMessage(first.error));
    ui.toast('Did not catch that — try typing instead.');
    if (convo) await new Promise((r) => setTimeout(r, 800));
    return;
  }
  nullStreak = 0;
  if (isConversationEnd(heard)) {
    const rest = stripConversationEnd(heard);
    if (!rest) {
      setStatus(body, 'Okay, all done.');
      speak('Okay, all done.');
      return convo ? 'stop' : undefined;
    }
    heard = rest;
    if (convo) stopAfterTurn = true;
  }

  // Live-first, local fallback (classify-raw-first/strip ordering inside).
  const resolved = await resolveIntent(heard, store.state);
  if (resolved === 'empty') {
    setStatus(body, 'Okay, all done.');
    speak('Okay, all done.');
    return;
  }
  let intent = resolved.intent;
  const live = resolved.live;
  const direct = resolved.direct;

  if (intent.kind === 'ambiguous') {
    const question = `“${intent.text}” — should I add that as new, or look it up?`;
    setStatus(body, question);
    await speakAndWait(question);
    if (!alive()) return;
    const follow = (await listenUtterance(body, start, 'Say “add it” or “look it up”…')).text;
    if (!alive()) return;
    if (follow && /^(look|find|search|where|check|show)/i.test(follow.trim())) {
      const found = showLookup(body, intent.text);
      const answer = found
        ? `Here is what matches “${intent.text}”. Nothing added.`
        : `Nothing recorded matches “${intent.text}”. Nothing added.`;
      setStatus(body, answer);
      speak(answer);
      return;
    }
    intent = {
      kind: 'add', text: intent.text,
      reason: 'You chose to save it — review before anything is created.',
    };
  }

  if (intent.kind === 'next') {
    const next = nextCommitment(store.state);
    const answer = next ? `Next up: ${next}.` : 'Nothing else is scheduled today.';
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    return;
  }

  if (intent.kind === 'where') {
    showLookup(body, intent.query);
    const answer = whereAnswer(intent.query, store.state);
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    return;
  }

  if (intent.kind === 'have') {
    const answer = haveAnswer(intent.query, store.state);
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    return;
  }

  if (intent.kind === 'wardrobe') {
    const answer = wardrobeAnswer(intent.query, store.state);
    const host = body.querySelector('#proposal')!;
    host.innerHTML = `<div class="card"><h3>Wardrobe check</h3>
      <p class="meta">${esc(answer)}</p>
      <p><button class="btn plain" id="as-wardrobe">Open wardrobe</button></p></div>`;
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    host.querySelector('#as-wardrobe')!.addEventListener('click', () => { close(); ui.open('wardrobe', {}); });
    return;
  }

  if (intent.kind === 'routine') {
    let name = intent.name;
    const host = body.querySelector('#proposal')!;
    if (!name) {
      const question = 'What should I call the new routine?';
      setStatus(body, question);
      await speakAndWait(question);
      if (!alive()) return;
      setStatus(body, 'Listening for a name… tap ⏺ Done when finished.');
      const follow = (await listenUtterance(body, start, 'Listening for a name…')).text;
      if (!alive()) return;
      if (!follow) { setStatus(body, 'No name heard — routine not created.'); return; }
      name = follow;
    }
    host.innerHTML = `<div class="card" style="border-color:var(--terra)"><h3>New routine?</h3>
      <label class="field">Name<input type="text" id="as-rou-name" value="${esc(name)}" /></label>
      <div class="row"><button class="btn plain" id="as-rou-yes">Create</button><button class="btn soft" id="as-rou-no">Cancel</button></div></div>`;
    setStatus(body, `Create the routine “${name}”? (${intent.reason})`);
    host.querySelector('#as-rou-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-rou-yes')!.addEventListener('click', () => {
      const final = host.querySelector<HTMLInputElement>('#as-rou-name')!.value.trim() || name;
      store.update((d) => { d.routines.push({ id: createId('rou'), name: final, belongingIds: [], tasks: [] }); });
      ui.toast(`Routine “${final}” created. Link items to it in the doorway.`, { action: 'Undo', onAction: () => store.undo() });
      speak(`Created routine ${final}.`);
      host.innerHTML = ''; setStatus(body, `Created routine “${final}”. Link items to it in the doorway.`);
    });
    await offerVoiceConfirm(body, alive, `Create the routine “${name}”?`, '#as-rou-yes', '#as-rou-no');
    return;
  }

  if (intent.kind === 'routineAdd') {
    const host = body.querySelector('#proposal')!;
    const routine = matchRoutine(intent.routineQuery, store.state);
    if (!routine) {
      const names = store.state.routines.map((r) => r.name).join('; ') || 'none yet';
      host.innerHTML = `<div class="card"><h3>No routine matches</h3>
        <p class="meta">Nothing called “${esc(intent.routineQuery)}”. Existing routines: ${esc(names)}. Nothing added.</p></div>`;
      const answer = `No routine matches “${intent.routineQuery}”. Nothing added.`;
      setStatus(body, answer);
      speak(answer);
      return;
    }
    const hits = searchBelongings(intent.itemText, store.state.belongings, store.state.locations);
    const topScore = hits.length ? hits[0].score : 0;
    const linked = hits.length && hits.filter((h) => h.score === topScore).length === 1 && topScore >= 2
      ? hits[0].belonging : null;
    const what = linked ? `“${linked.name}” (linked stored item)` : `“${intent.itemText}” (new routine task)`;
    host.innerHTML = `<div class="card" style="border-color:var(--terra)"><h3>Add to “${esc(routine.name)}”?</h3>
      <p>${esc(what)}</p>
      <div class="row"><button class="btn plain" id="as-ra-yes">Add</button><button class="btn soft" id="as-ra-no">Cancel</button></div></div>`;
    setStatus(body, `Add ${what} to “${routine.name}”? (${intent.reason})`);
    host.querySelector('#as-ra-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-ra-yes')!.addEventListener('click', () => {
      store.update((d) => {
        const r = d.routines.find((x) => x.id === routine.id);
        if (!r) return;
        if (linked) { if (!r.belongingIds.includes(linked.id)) r.belongingIds.push(linked.id); }
        else r.tasks.push({ id: createId('rout'), title: intent.itemText });
      });
      ui.toast(`Added to “${routine.name}”.`, { action: 'Undo', onAction: () => store.undo() });
      speak(`Added to ${routine.name}.`); host.innerHTML = ''; setStatus(body, `Added to “${routine.name}”.`);
    });
    await offerVoiceConfirm(body, alive, `Add ${what} to “${routine.name}”?`, '#as-ra-yes', '#as-ra-no');
    return;
  }

  if (intent.kind === 'outing') {
    const host = body.querySelector('#proposal')!;
    let routine = matchRoutine(intent.query, store.state);
    let event = matchEvent(intent.query, store.state);
    if (routine && !event) {
      const upcoming = store.state.events.filter((e) => e.date >= todayKey()).slice(0, 5);
      const question = upcoming.length
        ? `Which outing is it for — ${upcoming.map((e) => e.title).join(', ')}?`
        : 'There are no upcoming outings. Add an event first.';
      setStatus(body, question);
      if (!upcoming.length) { speak(question); return; }
      await speakAndWait(question);
      if (!alive()) return;
      const follow = (await listenUtterance(body, start, 'Say the outing name…')).text;
      if (!alive()) return;
      if (follow) event = matchEvent(follow, store.state);
    } else if (event && !routine) {
      const names = store.state.routines.map((r) => r.name).join(', ') || 'none yet';
      const question = `Which routine should I use — ${names}?`;
      setStatus(body, question);
      await speakAndWait(question);
      if (!alive()) return;
      const follow = (await listenUtterance(body, start, 'Say the routine name…')).text;
      if (!alive()) return;
      if (follow) routine = matchRoutine(follow, store.state);
    }
    if (!routine || !event) {
      const answer = 'I could not pin down both a routine and an outing. Nothing added.';
      host.innerHTML = `<div class="card"><h3>Not clear enough</h3><p class="meta">${esc(answer)}</p></div>`;
      setStatus(body, answer);
      speak(answer);
      return;
    }
    const labels = buildChecklistForEvent(store.state, event.id, routine.id).map((c) => c.label);
    if (!labels.length) {
      const answer = `“${routine.name}” adds nothing new to “${event.title}”.`;
      setStatus(body, answer);
      speak(answer);
      return;
    }
    host.innerHTML = `<div class="card" style="border-color:var(--terra)"><h3>Pack for “${esc(event.title)}”?</h3>
      <p class="meta">From routine “${esc(routine.name)}”: ${esc(labels.join('; '))}</p>
      <div class="row"><button class="btn plain" id="as-out-yes">Build list</button><button class="btn soft" id="as-out-no">Cancel</button></div></div>`;
    setStatus(body, `Build the list for “${event.title}”? (${intent.reason})`);
    host.querySelector('#as-out-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-out-yes')!.addEventListener('click', () => {
      const fresh = buildChecklistForEvent(store.state, event!.id, routine!.id);
      if (!fresh.length) { ui.toast('Nothing new — that list already covers this routine.'); return; }
      store.update((d) => { d.checklist.push(...fresh); });
      ui.toast(`Added ${fresh.length} items to the list.`, { action: 'Undo', onAction: () => store.undo() });
      speak(`Packing list ready for ${event!.title}.`);
      host.innerHTML = ''; setStatus(body, `Packing list ready for “${event!.title}”.`);
    });
    await offerVoiceConfirm(body, alive, `Build the list for “${event.title}”?`, '#as-out-yes', '#as-out-no');
    return;
  }

  if (intent.kind === 'rename') {
    const host = body.querySelector('#proposal')!;
    const matches = findRenamable(intent.target, store.state);
    if (matches.length !== 1) {
      const answer = matches.length
        ? `“${intent.target}” could be ${matches.map((m) => `“${m.name}” (${m.scope})`).join(', ')} — tap one where it lives. Nothing renamed.`
        : `Nothing matches “${intent.target}”. Nothing renamed.`;
      host.innerHTML = `<div class="card"><h3>Not renamed</h3><p class="meta">${esc(answer)}</p></div>`;
      setStatus(body, answer);
      speak(answer);
      return;
    }
    const [m] = matches;
    host.innerHTML = `
      <div class="card" style="border-color:var(--terra)"><h3>Rename ${esc(m.scope)}?</h3>
        <p class="meta">“${esc(m.name)}” →</p>
        <label class="field">New name<input type="text" id="as-ren-name" value="${esc(intent.newName)}" /></label>
        <div class="row"><button class="btn plain" id="as-ren-yes">Rename</button>
        <button class="btn soft" id="as-ren-no">Cancel</button></div></div>`;
    setStatus(body, `Rename “${m.name}” to “${intent.newName}”? (${intent.reason})`);
    host.querySelector('#as-ren-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-ren-yes')!.addEventListener('click', () => {
      const final = host.querySelector<HTMLInputElement>('#as-ren-name')!.value.trim();
      if (!final) { ui.toast('Name it something first.'); return; }
      store.update((d) => {
        if (m.scope === 'capture') { const c = d.captures.find((x) => x.id === m.id); if (c) c.name = final; }
        else if (m.scope === 'spot') { const l = d.locations.find((x) => x.id === m.id); if (l) l.name = final; }
        else { const b = d.belongings.find((x) => x.id === m.id); if (b) b.name = final; }
      });
      ui.toast(`Renamed to “${final}”.`, { action: 'Undo', onAction: () => store.undo() });
      speak(`Renamed to ${final}.`);
      host.innerHTML = '';
      setStatus(body, `Renamed to “${final}”.`);
    });
    await offerVoiceConfirm(body, alive, `Rename “${m.name}” to “${intent.newName}”?`, '#as-ren-yes', '#as-ren-no');
    return;
  }

  if (intent.kind === 'spot') {
    const host = body.querySelector('#proposal')!;
    host.innerHTML = `
      <div class="card" style="border-color:var(--terra)"><h3>New spot?</h3>
        <label class="field">Name<input type="text" id="as-spot-name" value="${esc(intent.name)}" /></label>
        <div class="row"><button class="btn plain" id="as-spot-yes">Create</button>
        <button class="btn soft" id="as-spot-no">Cancel</button></div></div>`;
    setStatus(body, `Create the spot “${intent.name}”? (${intent.reason})`);
    host.querySelector('#as-spot-no')!.addEventListener('click', () => { host.innerHTML = ''; setStatus(body, 'Okay, left as is.'); });
    host.querySelector('#as-spot-yes')!.addEventListener('click', () => {
      const final = host.querySelector<HTMLInputElement>('#as-spot-name')!.value.trim();
      if (!final) { ui.toast('Name the spot first.'); return; }
      store.update((d) => { d.locations.push({ id: createId('loc'), name: final, createdAt: nowIso() }); });
      ui.toast(`Spot “${final}” saved.`, { action: 'Undo', onAction: () => store.undo() });
      speak(`Spot ${final} saved.`);
      host.innerHTML = '';
      setStatus(body, `Spot “${final}” saved.`);
    });
    await offerVoiceConfirm(body, alive, `Create the spot “${intent.name}”?`, '#as-spot-yes', '#as-spot-no');
    return;
  }

  if (intent.kind === 'desk') {
    const answer = deskSummary(store.state);
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    return;
  }

  if (intent.kind === 'wear') {
    const pick = wearPick(store.state);
    const answer = pick
      ? `How about ${pick.names}${pick.occasion ? ` for ${pick.occasion}` : ''}?`
      : 'I could not put together a full outfit from available pieces — your wardrobe has the details.';
    const host = body.querySelector('#proposal')!;
    host.innerHTML = `<div class="card"><h3>Outfit ideas live in the wardrobe</h3>
      <p class="meta">${esc(answer)}</p>
      <p><button class="btn plain" id="as-wardrobe">Open wardrobe</button></p></div>`;
    setStatus(body, `${answer} (${intent.reason})`);
    speak(answer);
    host.querySelector('#as-wardrobe')!.addEventListener('click', () => { close(); ui.open('wardrobe', {}); });
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
    await offerVoiceConfirm(body, alive, `Mark “${intent.title}” done?`, '#as-done-yes', '#as-done-no');
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
    setStatus(body, 'Listening for your answer… tap ⏺ Done when finished (or say “skip”, then Done).');
    const answer = (await listenUtterance(body, start, 'Listening for your answer…')).text;
    if (!alive()) return;
    if (answer && !/^skip\b/i.test(answer)) p = applySlotAnswer(p, slot, answer);
  }
  if (!alive()) return;
  setStatus(body, summarizeProposal(p));
  showProposal(body, ui, capture.id, {
    proposal: p,
    label: direct ? DIRECT_LABEL : live ? LIVE_LABEL : undefined,
    onFinished: (final, outcome) => {
      if (outcome === 'confirmed') speak(summarizeCreated(final));
      if (!handsFreeEnabled()) close();
    },
  });
  await offerVoiceConfirm(body, alive, 'Create this?', '#p-confirm', '#p-archive');
}
