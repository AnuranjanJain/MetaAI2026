// Clip recorder for Muse Voice Transcribe. Browser-only.
// Records via MediaRecorder, decodes, downmixes to mono 16kHz, and encodes
// the WAV bytes Meta accepts. Returns base64, or null when recording fails.

import { encodeWav, resample, toMono, TRANSCRIBE_SAMPLE_RATE } from './core/transcribe.js';

export interface ClipHandle {
  done: Promise<string | null>;
  stop: () => void;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Record up to `maxMs`, resolving base64 WAV on stop or timeout. */
export function startClip(maxMs = 10000): ClipHandle {
  let stopFn: () => void = () => {};
  const done = (async (): Promise<string | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        return await recordStream(stream, maxMs, (stop) => { stopFn = stop; });
      } finally {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      return null;
    }
  })();
  return { done, stop: () => stopFn() };
}

function recordStream(stream: MediaStream, maxMs: number, onStop: (stop: () => void) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      resolve(null);
      return;
    }
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    };
    onStop(finish);
    const timer = setTimeout(finish, Math.min(Math.max(maxMs, 1000), 15000));
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = () => { clearTimeout(timer); resolve(null); };
    rec.onstop = () => {
      clearTimeout(timer);
      void decodeChunks(chunks).then(resolve);
    };
    try {
      rec.start();
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function decodeChunks(chunks: Blob[]): Promise<string | null> {
  if (!chunks.length) return null;
  try {
    const buf = await new Blob(chunks).arrayBuffer();
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        channels.push(decoded.getChannelData(c));
      }
      const mono = toMono(channels);
      if (!mono.length) return null;
      const wav = encodeWav(resample(mono, decoded.sampleRate, TRANSCRIBE_SAMPLE_RATE), TRANSCRIBE_SAMPLE_RATE);
      if (wav.length < 1000) return null;
      return bytesToB64(wav);
    } finally {
      void ctx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/** True when this browser can record clips (secure context + APIs). */
export function clipSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && typeof AudioContext !== 'undefined';
}
