// Listening sessions: final segments accumulate across browser restarts,
// interim text replaces (never appends), output is trimmed and capped.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscript, chunkForSpeech, isConversationEnd, micErrorMessage, parseConfirmAnswer, stripConversationEnd, stripTrailingStopPhrase } from '../src/voice.js';

describe('createTranscript', () => {
  it('appends final segments across restarts', () => {
    const t = createTranscript();
    t.addFinal('Dentist appointment');
    t.addFinal('tomorrow at 2:30');
    assert.equal(t.text(), 'Dentist appointment tomorrow at 2:30');
    assert.equal(t.heardAnything(), true);
  });

  it('replaces interim text instead of duplicating it', () => {
    const t = createTranscript();
    t.addFinal('Dentist');
    t.setInterim('tomor');
    assert.equal(t.text(), 'Dentist tomor');
    t.setInterim('tomorrow at');
    assert.equal(t.text(), 'Dentist tomorrow at');
    t.addFinal('tomorrow at 2:30');
    t.setInterim('');
    assert.equal(t.text(), 'Dentist tomorrow at 2:30');
  });

  it('ignores blank segments and reports nothing heard when empty', () => {
    const t = createTranscript();
    t.addFinal('   ');
    t.setInterim('  ');
    assert.equal(t.text(), '');
    assert.equal(t.heardAnything(), false);
  });

  it('caps output at 1000 characters', () => {
    const t = createTranscript();
    t.addFinal('word '.repeat(500));
    assert.ok(t.text().length <= 1000);
  });
});

describe('stripTrailingStopPhrase', () => {
  it('removes trailing stop phrases, tolerating case and punctuation', () => {
    assert.equal(stripTrailingStopPhrase("Dentist tomorrow that's it"), 'Dentist tomorrow');
    assert.equal(stripTrailingStopPhrase('Buy milk, that\'s all.'), 'Buy milk');
    assert.equal(stripTrailingStopPhrase('Pack charger, I\'m DONE!'), 'Pack charger');
    assert.equal(stripTrailingStopPhrase('finished'), '');
    assert.equal(stripTrailingStopPhrase('  That\'s it  '), '');
  });

  it('collapses stacked phrases and stray commas', () => {
    assert.equal(stripTrailingStopPhrase('Call Sam done, that\'s it'), 'Call Sam done');
  });

  it('leaves mid-sentence and non-phrase endings alone', () => {
    assert.equal(
      stripTrailingStopPhrase("I'm done talking about the dentist"),
      "I'm done talking about the dentist",
    );
    assert.equal(stripTrailingStopPhrase('done deal'), 'done deal');
    assert.equal(stripTrailingStopPhrase('unfinished'), 'unfinished');
  });

  it('strips a trailing done-command word — ordering is the caller\'s job', () => {
    // The pure helper strips; classifyIntent must classify the RAW text
    // first so "Mark buy milk done" still matches as done.
    assert.equal(stripTrailingStopPhrase('Mark buy milk done'), 'Mark buy milk');
  });
});

describe('parseConfirmAnswer', () => {
  it('hears yes in its many forms', () => {
    for (const t of ['yes', 'Yes!', 'yeah', 'yep, do it', 'confirm', 'save it', 'go ahead', 'okay']) {
      assert.equal(parseConfirmAnswer(t), 'yes', t);
    }
  });

  it('hears no in its many forms', () => {
    for (const t of ['no', 'Nope.', 'nah', 'cancel', "don't", 'never mind']) {
      assert.equal(parseConfirmAnswer(t), 'no', t);
    }
  });

  it('tolerates a trailing stop phrase but never invents a yes', () => {
    assert.equal(parseConfirmAnswer("yes, that's it"), 'yes');
    assert.equal(parseConfirmAnswer("no, that's all"), 'no');
    assert.equal(parseConfirmAnswer(''), null);
    assert.equal(parseConfirmAnswer('finished'), null);
    assert.equal(parseConfirmAnswer('done'), null);
    assert.equal(parseConfirmAnswer('yesterday I bought milk'), null);
    assert.equal(parseConfirmAnswer('note this down'), null);
  });
});

describe('conversation sign-off', () => {
  it('ends only on for-now/for-today/stop-listening forms', () => {
    for (const t of ["that's it for now", "That's all for today!", "we're done for now", 'stop listening', 'goodbye']) {
      assert.equal(isConversationEnd(t), true, t);
    }
  });

  it('leaves utterance-ending stop phrases to the current turn', () => {
    for (const t of ["that's it", 'done', 'finished', 'add milk', 'mark buy milk done']) {
      assert.equal(isConversationEnd(t), false, t);
    }
  });

  it('keeps a final request before the sign-off', () => {
    assert.equal(stripConversationEnd("Add milk, that's it for now"), 'Add milk');
    assert.equal(stripConversationEnd("add milk and that's it for now"), 'add milk');
    assert.equal(stripConversationEnd('stop listening'), '');
  });
});

describe('micErrorMessage', () => {
  it('tells blocked-mic users exactly how to unblock', () => {
    for (const code of ['not-allowed', 'service-not-allowed']) {
      const msg = micErrorMessage(code);
      assert.match(msg, /blocked/i);
      assert.match(msg, /Allow/);
    }
  });

  it('names network and missing-mic failures', () => {
    assert.match(micErrorMessage('network'), /internet/i);
    assert.match(micErrorMessage('audio-capture'), /No microphone/i);
  });

  it('falls back to a generic retry note for silence and unknowns', () => {
    for (const code of ['no-speech', 'aborted', 'weird-code', null]) {
      assert.match(micErrorMessage(code), /Did not catch that/);
    }
  });
});

describe('chunkForSpeech', () => {
  it('returns one chunk for short text', () => {
    assert.deepEqual(chunkForSpeech('Hello there.'), ['Hello there.']);
    assert.deepEqual(chunkForSpeech('   '), []);
  });

  it('splits long answers at sentence boundaries without truncation', () => {
    const text = `${'First sentence here. '.repeat(30)}${'Second sentence here. '.repeat(30)}`;
    const chunks = chunkForSpeech(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 480));
    assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
  });
});
