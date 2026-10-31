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
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
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

/** Speak a short summary; cancels any current speech first. */
export function speak(text: string): void {
  if (!voiceOutputSupported()) return;
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch { /* audio unavailable — stay silent */ }
}

/** Speak and resolve when speech finishes (or after a safe timeout), so a
    follow-up listen does not start while the prompt is still playing. */
export function speakAndWait(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!voiceOutputSupported()) { resolve(); return; }
    const clean = text.trim().slice(0, 500);
    if (!clean) { resolve(); return; }
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1;
      u.onend = done;
      u.onerror = done;
      window.setTimeout(done, Math.min(6000, 1200 + clean.length * 70));
      window.speechSynthesis.speak(u);
    } catch { done(); }
  });
}

export function stopSpeak(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}
