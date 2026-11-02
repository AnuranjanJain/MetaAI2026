// Transcribe helpers: WAV encoding shape + reply parsing. No network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, resample, toMono, transcribeRequestJson, transcribeText, TRANSCRIBE_MODEL, TRANSCRIBE_URL } from '../src/core/transcribe.js';
import { transcribeViaMuse } from '../src/core/liveModel.js';

describe('transcribe constants', () => {
  it('names the verified Meta endpoint and model', () => {
    assert.equal(TRANSCRIBE_URL, 'https://api.meta.ai/v1/asr/transcribe');
    assert.equal(TRANSCRIBE_MODEL, 'muse-voice-transcribe-1.0');
    const req = JSON.parse(transcribeRequestJson()) as Record<string, string>;
    assert.equal(req.model, TRANSCRIBE_MODEL);
    assert.equal(req.audioEncoding, 'WAV');
  });
});

describe('toMono + resample', () => {
  it('averages channels and rescales length', () => {
    const mono = toMono([new Float32Array([0, 1]), new Float32Array([1, 0])]);
    assert.deepEqual([...mono], [0.5, 0.5]);
    const down = resample(new Float32Array([0, 0.5, 1, 1]), 48000, 16000);
    assert.equal(down.length, 1);
  });
});

describe('encodeWav', () => {
  it('writes a RIFF/WAVE header with 16-bit PCM', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const head = String.fromCharCode(...wav.slice(0, 4));
    const fmt = String.fromCharCode(...wav.slice(12, 16));
    assert.equal(head, 'RIFF');
    assert.equal(fmt, 'fmt ');
    assert.equal(wav.length, 44 + 3 * 2);
  });
});

describe('transcribeText', () => {
  it('pulls the transcript and caps length', () => {
    assert.equal(transcribeText({ transcript: '  hello  ' }), 'hello');
    assert.equal(transcribeText({}), null);
    assert.equal(transcribeText({ transcript: 'x'.repeat(2000) })?.length, 1000);
  });
});

describe('transcribeViaMuse', () => {
  const stub = (body: unknown, status = 200): typeof fetch =>
    (async () => ({
      ok: status >= 200 && status < 300, status,
      json: async () => body,
    })) as unknown as typeof fetch;

  it('passes a valid transcript through', async () => {
    const out = await transcribeViaMuse('QUJD', {
      proxyUrl: 'https://proxy.test/api/transcribe',
      fetchFn: stub({ transcript: 'buy milk' }),
    });
    assert.equal(out, 'buy milk');
  });

  it('returns null on bad shapes, errors, and empty audio', async () => {
    const url = 'https://proxy.test/api/transcribe';
    assert.equal(await transcribeViaMuse('QUJD', { proxyUrl: url, fetchFn: stub({}) }), null);
    assert.equal(await transcribeViaMuse('QUJD', { proxyUrl: url, fetchFn: stub({}, 502) }), null);
    assert.equal(await transcribeViaMuse('', { proxyUrl: url, fetchFn: stub({ transcript: 'x' }) }), null);
    assert.equal(await transcribeViaMuse('QUJD', { proxyUrl: '', fetchFn: stub({ transcript: 'x' }) }), null);
  });
});
