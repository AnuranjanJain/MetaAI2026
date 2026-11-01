// Voice helpers: optional speech input/output via Web Speech APIs.
// Everything here is feature-detected; unsupported browsers get graceful
// fallbacks in the calling views. Transcripts are untrusted input: callers
// trim and cap length before inserting into state-bound fields.

export function voiceInputSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return typeof w['SpeechRecognition'] === 'function' || typeof w['webkitSpeechRecognition'] === 'function';
}

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>;
      }) => void)
    | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function createRecognition(): RecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** Listen once; resolves with a trimmed transcript or null on failure/cancel. */
export function listenOnce(opts: { lang?: string; timeoutMs?: number } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const rec = createRecognition();
    if (!rec) { resolve(null); return; }
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      try { rec.abort(); } catch { /* already ended */ }
      resolve(v);
    };
    const timer = window.setTimeout(() => done(null), opts.timeoutMs ?? 20000);
    rec.lang = opts.lang ?? navigator.language ?? 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      try {
        const last = ev.results[ev.results.length - 1];
        const text = last?.[0]?.transcript?.trim() ?? '';
        window.clearTimeout(timer);
        done(text ? text.slice(0, 1000) : null);
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    rec.onerror = () => { window.clearTimeout(timer); done(null); };
    rec.onend = () => { window.clearTimeout(timer); done(null); };
    try {
      rec.start();
    } catch {
      window.clearTimeout(timer);
      done(null);
    }
  });
}

export function voiceOutputSupported(): boolean {
  return 'speechSynthesis' in window;
}

/** Pure transcript accumulator (node-testable). Final segments append;
    interim text replaces the preview slot; output is trimmed and capped. */
export function createTranscript(cap = 1000): {
  addFinal: (text: string) => void;
  setInterim: (text: string) => void;
  text: () => string;
  heardAnything: () => boolean;
} {
  const finals: string[] = [];
  let interim = '';
  const clip = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, cap);
  return {
    addFinal: (text: string) => { const t = text.trim(); if (t) finals.push(t); },
    setInterim: (text: string) => { interim = text.trim(); },
    text: () => clip([...finals, interim].filter(Boolean).join(' ')),
    heardAnything: () => finals.length > 0 || interim.length > 0,
  };
}

export interface ListeningSession {
  /** Resolves with the full accumulated transcript, or null when nothing
      usable was heard / permission failed / the user cancelled. */
  done: Promise<string | null>;
  /** The user is finished — resolve now with everything said so far. */
  stop: () => void;
  /** Discard everything — resolve null. */
  cancel: () => void;
}

export interface ListenUntilDoneOpts {
  lang?: string;
  /** Silence after heard speech that ends the session. Default 5000. */
  silenceMs?: number;
  /** No speech at all within this long → null. Default 15000. */
  noSpeechMs?: number;
  /** Overall safety cap — resolves with whatever was heard. Default 120000. */
  maxMs?: number;
  /** End the session early when a final segment ends with a stop phrase
      ("that's it", "done", …). Default true. The full text is kept —
      the caller strips the phrase AFTER classifying, so a done-command
      like "Mark buy milk done" still matches first. */
  stopPhrases?: boolean;
  /** Live preview (final + interim text so far) for the UI. */
  onInterim?: (text: string) => void;
}

/** Trailing phrases that mean "I'm finished speaking". Pure and
    node-testable. End-anchored, case-insensitive, punctuation-tolerant. */
const STOP_PHRASES = [
  "that's it", 'thats it', "that's all", 'thats all',
  "i'm done", 'im done', 'done', 'finished',
];

/** Remove one trailing stop phrase. Single pass on purpose: stacked
    phrases ("…done, that's it") peel only the outer one so a done-command
    underneath still classifies. */
export function stripTrailingStopPhrase(text: string): string {
  let t = text.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  for (const p of STOP_PHRASES) {
    if (lower === p || lower.endsWith(` ${p}`)) {
      return t.slice(0, lower.length - p.length).trim().replace(/[,;.]+$/, '').trim();
    }
  }
  return t;
}

/**
 * A self-restarting listening session for full utterances. The browser may
 * end recognition whenever it likes (first pause, hiccup, internal timeout) —
 * this restarts a fresh instance and keeps accumulating until the *user* is
 * done: a stop phrase, `silenceMs` of quiet, the safety cap, or an explicit
 * `stop()`. The full text (stop phrase included) is returned; callers strip
 * it with `stripTrailingStopPhrase` after classifying. `listenOnce` stays
 * for short one-shot fields.
 */
export function startListeningUntilDone(opts: ListenUntilDoneOpts = {}): ListeningSession {
  const silenceMs = opts.silenceMs ?? 5000;
  const noSpeechMs = opts.noSpeechMs ?? 15000;
  const maxMs = opts.maxMs ?? 120000;
  const stopPhrases = opts.stopPhrases ?? true;
  const transcript = createTranscript(1000);
  const startedAt = Date.now();

  let settled = false;
  let userDone = false;
  let restarts = 0;
  let lastHeardAt = 0;
  let rec: RecognitionLike | null = null;
  let watchdog: number | undefined;
  let resolveDone!: (v: string | null) => void;
  const done = new Promise<string | null>((resolve) => { resolveDone = resolve; });

  const finish = (value: string | null) => {
    if (settled) return;
    settled = true;
    if (watchdog !== undefined) window.clearInterval(watchdog);
    try { rec?.abort(); } catch { /* already ended */ }
    resolveDone(value);
  };
  const finishWithTranscript = () => {
    const t = transcript.text();
    finish(t ? t : null);
  };

  const startRec = () => {
    if (settled || userDone) return;
    const r = createRecognition();
    if (!r) { finishWithTranscript(); return; }
    rec = r;
    r.lang = opts.lang ?? navigator.language ?? 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onspeechstart = () => { lastHeardAt = Date.now(); };
    r.onresult = (ev) => {
      lastHeardAt = Date.now();
      try {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const alt = ev.results[i]?.[0];
          const text = alt?.transcript ?? '';
          if (!text.trim()) continue;
          if (alt?.isFinal) {
            transcript.addFinal(text);
            // User said they are finished — end the session now, but keep
            // the full text; the caller classifies first, then strips.
            if (stopPhrases && stripTrailingStopPhrase(text) !== text.trim().replace(/\s+/g, ' ')) {
              opts.onInterim?.(transcript.text());
              finishWithTranscript();
              break;
            }
          } else transcript.setInterim(text);
        }
        if (!transcript.heardAnything()) transcript.setInterim('');
        opts.onInterim?.(transcript.text());
      } catch { /* keep listening */ }
    };
    r.onerror = (e) => {
      // Permission / service failures are final — restarting would spin.
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        finish(transcript.text() ? transcript.text() : null);
      }
    };
    r.onend = () => {
      if (settled || userDone) { finishWithTranscript(); return; }
      const quietFor = Date.now() - (lastHeardAt || startedAt);
      const heard = transcript.heardAnything();
      if ((!heard && quietFor >= noSpeechMs) || (heard && quietFor >= silenceMs)) {
        finishWithTranscript();
        return;
      }
      if (restarts >= 25) { finishWithTranscript(); return; }
      restarts++;
      window.setTimeout(() => { if (!settled && !userDone) startRec(); }, 150);
    };
    try {
      r.start();
    } catch {
      finishWithTranscript();
    }
  };

  watchdog = window.setInterval(() => {
    if (settled) return;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxMs) { finishWithTranscript(); return; }
    if (!transcript.heardAnything()) {
      if (elapsed >= noSpeechMs) finish(null);
      return;
    }
    if (Date.now() - lastHeardAt >= silenceMs) finishWithTranscript();
  }, 250);

  startRec();

  return {
    done,
    stop: () => { userDone = true; finishWithTranscript(); },
    cancel: () => { userDone = true; finish(null); },
  };
}

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  lang?: string;
}

/** Pick the best available voice: same language, preferring natural/neural
    builds, then vendor defaults. Null-safe — callers fall back to default. */
function pickVoice(lang?: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const want = (lang ?? navigator.language ?? 'en-US').slice(0, 2).toLowerCase();
    const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(want));
    const pool = sameLang.length ? sameLang : voices;
    return pool.find((v) => /natural|neural|premium|enhanced/i.test(v.name))
      ?? pool.find((v) => /^google/i.test(v.name))
      ?? pool.find((v) => v.default)
      ?? pool[0];
  } catch { return null; }
}

/** Split long text at sentence boundaries so queued chunks stay under the
    per-utterance cap instead of truncating mid-answer. Pure. */
export function chunkForSpeech(text: string, cap = 480): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) ?? [clean];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const part = s.trim();
    if (!part) continue;
    if (part.length > cap) {
      if (cur.trim()) { chunks.push(cur.trim()); cur = ''; }
      for (let i = 0; i < part.length; i += cap) chunks.push(part.slice(i, i + cap).trim());
      continue;
    }
    if ((cur + ' ' + part).trim().length > cap) { chunks.push(cur.trim()); cur = part; }
    else cur = `${cur} ${part}`;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [clean.slice(0, cap)];
}

/** Speak a short summary; cancels any current speech first. Long answers
    are queued as sentence chunks rather than cut off. */
export function speak(text: string, opts: SpeakOpts = {}): void {
  if (!voiceOutputSupported()) return;
  const chunks = chunkForSpeech(text);
  if (!chunks.length) return;
  try {
    window.speechSynthesis.cancel();
    try { void window.speechSynthesis.getVoices(); } catch { /* sync voices where needed */ }
    const voice = pickVoice(opts.lang);
    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      if (opts.lang) u.lang = opts.lang;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      window.speechSynthesis.speak(u);
    }
  } catch { /* audio unavailable — stay silent */ }
}

/** Speak and resolve when speech finishes (or after a safe timeout), so a
    follow-up listen does not start while the prompt is still playing. */
export function speakAndWait(text: string, opts: SpeakOpts = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!voiceOutputSupported()) { resolve(); return; }
    const chunks = chunkForSpeech(text);
    if (!chunks.length) { resolve(); return; }
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try {
      window.speechSynthesis.cancel();
      try { void window.speechSynthesis.getVoices(); } catch { /* sync voices where needed */ }
      const voice = pickVoice(opts.lang);
      let i = 0;
      const next = (): void => {
        if (i >= chunks.length) { done(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        if (voice) u.voice = voice;
        if (opts.lang) u.lang = opts.lang;
        u.rate = opts.rate ?? 1;
        u.pitch = opts.pitch ?? 1;
        u.onend = next;
        u.onerror = next;
        window.speechSynthesis.speak(u);
      };
      window.setTimeout(done, Math.min(30000, 2000 + chunks.join(' ').length * 70));
      next();
    } catch { done(); }
  });
}

export function stopSpeak(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}

// ---------- Hands-free confirm (opt-in) ----------

const HF_KEY = 'pocketroom.handsfree';

/** True only after the user explicitly toggles Hands-free on. Off by default. */
export function handsFreeEnabled(): boolean {
  try { return localStorage.getItem(HF_KEY) === '1'; } catch { return false; }
}

export function setHandsFree(on: boolean): void {
  try { localStorage.setItem(HF_KEY, on ? '1' : '0'); } catch { /* memory-only */ }
}

const YES_RE = /^(yes|yeah|yep|yup|sure|confirm|confirmed|save|do it|go ahead|ok|okay|please do|that's right|that's correct)\b/i;
const NO_RE = /^(no|nope|nah|cancel|stop|don't|dont|never mind|nevermind|not yet|go back)\b/i;

/** Map a spoken answer to yes/no. A trailing stop phrase ("yes, that's it")
    still counts; bare "done"/"finished" and anything else return null so the
    caller leaves the card open for a tap. Pure. */
export function parseConfirmAnswer(text: string): 'yes' | 'no' | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.?!]+$/, '').trim();
  if (!t) return null;
  const core = stripTrailingStopPhrase(t) || t;
  if (YES_RE.test(core)) return 'yes';
  if (NO_RE.test(core)) return 'no';
  return null;
}

/** Speak a confirm question, then listen once for yes/no. Resolves null on
    timeout, unparseable answers, or unsupported browsers — the caller then
    leaves the card open for a tap. Never creates anything by itself. */
export async function voiceConfirm(question: string, opts: { timeoutMs?: number } = {}): Promise<'yes' | 'no' | null> {
  if (!voiceInputSupported()) return null;
  try { await speakAndWait(`${question} Say yes or no.`); } catch { /* still try listening */ }
  const heard = await listenOnce({ timeoutMs: opts.timeoutMs ?? 12000 });
  if (!heard) return null;
  return parseConfirmAnswer(heard);
}
