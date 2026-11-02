// Vercel server function: POST { audio } → { transcript }.
// The client sends base64 WAV (mono 16-bit PCM @16kHz, Meta's accepted
// format); this route forwards it as multipart to Muse Voice Transcribe.
// Key handling matches interpret.ts: MUSE_API_KEY from process.env only.
// Verified 2026-11-02 against https://dev.meta.ai/docs/speech-to-text.

import { TRANSCRIBE_MODEL, TRANSCRIBE_URL, transcribeRequestJson, transcribeText } from '../src/core/transcribe.js';

/** ~1.5MB of WAV ≈ 45s at 16kHz mono 16-bit. */
const MAX_AUDIO_CHARS = 2000000;
const UPSTREAM_TIMEOUT_MS = 25000;

interface ProxyReq {
  method?: string;
  body?: unknown;
}

interface ProxyRes {
  status: (code: number) => ProxyRes;
  json: (obj: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function err(res: ProxyRes, code: number, message: string): void {
  res.status(code).json({ error: message });
}

export default async function handler(req: ProxyReq, res: ProxyRes): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }
  if (req.method !== 'POST') {
    err(res, 405, 'method not allowed');
    return;
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      err(res, 400, 'invalid json');
      return;
    }
  }
  const rawAudio = (body as { audio?: unknown } | null)?.audio;
  if (typeof rawAudio !== 'string' || !rawAudio) {
    err(res, 400, 'audio is required');
    return;
  }
  // Accept raw base64 or a data URL; strip the prefix either way.
  let audio: string = rawAudio;
  const comma = audio.indexOf(',');
  if (audio.startsWith('data:audio/') && comma !== -1) audio = audio.slice(comma + 1);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(audio) || audio.length > MAX_AUDIO_CHARS) {
    err(res, 413, 'audio too large or not base64');
    return;
  }

  const key = process.env.MUSE_API_KEY;
  if (!key) {
    err(res, 500, 'proxy not configured');
    return;
  }

  let wav: Buffer;
  try {
    wav = Buffer.from(audio, 'base64');
  } catch {
    err(res, 400, 'audio is not decodable');
    return;
  }
  if (wav.length < 1000 || wav.length > 1500000) {
    err(res, 413, 'audio too short or too long');
    return;
  }

  const form = new FormData();
  form.append('request', new Blob([transcribeRequestJson()], { type: 'application/json' }));
  form.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'clip.wav');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'transcription unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'transcription unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'transcription unavailable');
    return;
  }
  const transcript = transcribeText(payload);
  if (!transcript) {
    err(res, 502, 'transcription unavailable');
    return;
  }
  res.status(200).json({ transcript, model: TRANSCRIBE_MODEL });
}
