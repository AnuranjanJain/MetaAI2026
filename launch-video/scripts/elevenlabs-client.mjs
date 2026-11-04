import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
// Run callers with node --env-file=.env.local; credentials never enter source.
export const createSpeechClient = () => new ElevenLabsClient();
