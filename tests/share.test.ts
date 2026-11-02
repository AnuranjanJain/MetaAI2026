// Share + poster pure helpers: real counts only, nothing invented.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../src/core/model.js';
import { dayVibe, fitLine, posterSvg, shareText, xIntentUrl } from '../src/core/share.js';

describe('dayVibe', () => {
  it('counts events, tasks, and inbox honestly', () => {
    const s = seedState();
    const day = s.events[0].date;
    const vibe = dayVibe(s, day);
    assert.equal(vibe.events, 1);
    assert.equal(vibe.tasksOpen, 1);
    assert.equal(vibe.inbox, 0);
    assert.ok(vibe.headline.length > 0);
  });
});

describe('posterSvg', () => {
  it('renders a standalone SVG with the day headline', () => {
    const s = seedState();
    const day = s.events[0].date;
    const svg = posterSvg(s, day);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes(day));
    assert.ok(svg.includes('on-device SVG'));
  });

  it('escapes titles so markup cannot break the poster', () => {
    const s = seedState();
    s.events[0].title = 'A<B>&"C"';
    const svg = posterSvg(s, s.events[0].date);
    assert.ok(!svg.includes('A<B>'));
    assert.ok(svg.includes('A&lt;B&gt;&amp;&quot;C&quot;'));
  });

  it('shrinks long headlines to fit instead of bleeding past the edge', () => {
    const s = seedState();
    s.events[0].title = 'Deport aways at 7 00 am';
    s.events[0].start = '07:00';
    const svg = posterSvg(s, s.events[0].date);
    assert.ok(svg.includes('Deport aways at 7 00 am'));
    assert.ok(svg.includes('07:00 · Deport aways at 7 00 am'));
    assert.ok(svg.includes('font-size="34"'), 'long headline must shrink to fit');
  });
});

describe('fitLine', () => {
  it('keeps short lines at full size', () => {
    assert.deepEqual(fitLine('Today, handled', 480, 52, 30, 0.6, 26), { text: 'Today, handled', fontSize: 52 });
  });

  it('shrinks to fit and ellipsizes past the cap', () => {
    const long = fitLine('Deport aways at 7 00 am', 480, 52, 30, 0.6, 26);
    assert.equal(long.text, 'Deport aways at 7 00 am');
    assert.ok(long.fontSize < 52 && long.fontSize >= 30);
    const capped = fitLine('x'.repeat(60), 480, 52, 30, 0.6, 26);
    assert.equal(capped.text, `${'x'.repeat(25)}…`);
    assert.equal(capped.fontSize, 30);
  });
});

describe('shareText + xIntentUrl', () => {
  it('names real counts and the hackathon tag', () => {
    const s = seedState();
    const text = shareText(s, s.events[0].date);
    assert.ok(text.includes('1 event(s)'));
    assert.ok(text.includes('#BuildForYourWorld'));
    assert.ok(xIntentUrl(text).startsWith('https://twitter.com/intent/tweet?text='));
  });
});
