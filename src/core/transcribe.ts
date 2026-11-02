// Muse Voice Transcribe helpers. Pure + DOM-free so node tests cover them.
// Verified 2026-11-02 against https://dev.meta.ai/docs/speech-to-text:
// POST https://api.meta.ai/v1/asr/transcribe with multipart parts
// `request` (JSON: mode/model/audioEncoding) and `audio` (WAV:
// mono, 16-bit PCM, 16 or 24 kHz). JSON reply carries `transcript`.

export const TRANSCRIBE_URL = 'https://api.meta.ai/v1/asr/transcribe';
export const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';
export const TRANSCRIBE_SAMPLE_RATE = 16000;
const MAX_TRANSCRIPT = 1000;

/** Fixed request part. ENDPOINTING gives turn boundaries for voice commands. */
export function transcribeRequestJson(): string {
  return JSON.stringify({ mode: 'ENDPOINTING', model: TRANSCRIBE_MODEL, audioEncoding: 'WAV' });
}

/** Downmix multi-channel float audio to mono by averaging. Pure. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const c of channels) sum += c[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** Resample by linear interpolation. Pure. */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  if (fromRate <= 0 || toRate <= 0 || !samples.length) return new Float32Array(0);
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = pos - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
}

/** Encode mono float samples as a RIFF/WAVE file (16-bit PCM). Pure. */
export function encodeWav(mono: Float32Array, sampleRate: number): Uint8Array {
  const n = mono.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const writeAscii = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeAscii(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const clamped = Math.max(-1, Math.min(1, mono[i]));
    v.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buf);
}

/** Extract the transcript from a transcribe JSON reply. Null when absent. */
export function transcribeText(payload: unknown): string | null {
  const t = (payload as { transcript?: unknown } | null)?.transcript;
  if (typeof t !== 'string' || !t.trim()) return null;
  return t.trim().slice(0, MAX_TRANSCRIPT);
}
