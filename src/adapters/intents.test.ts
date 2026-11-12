import { describe, it, expect } from 'vitest';
import { parseIntents, intentHoldbackLength } from './intents';

const SCHEDULE = '```intent\n{"type":"schedule","title":"Planning session","day":2,"project":"Chinese Book"}\n```';
const WEBVIEW = '```intent\n{"type":"webview","title":"Map outline","ref":"art-chinese-map"}\n```';

describe('parseIntents', () => {
  it('extracts a schedule intent and strips the block from the text', () => {
    const out = parseIntents(`Let us meet.\n\n${SCHEDULE}\n\nBring the outline.`);
    expect(out.cleanText).toBe('Let us meet.\n\nBring the outline.');
    expect(out.schedule).toEqual([{ title: 'Planning session', day: 2, projectName: 'Chinese Book' }]);
    expect(out.webview).toEqual([]);
  });

  it('extracts a webview intent (ref + optional title)', () => {
    const out = parseIntents(`See this:\n${WEBVIEW}`);
    expect(out.cleanText).toBe('See this:');
    expect(out.webview).toEqual([{ ref: 'art-chinese-map', title: 'Map outline' }]);
  });

  it('extracts both block types from one message', () => {
    const out = parseIntents(`Both:\n${SCHEDULE}\n${WEBVIEW}`);
    expect(out.schedule).toHaveLength(1);
    expect(out.webview).toHaveLength(1);
    expect(out.cleanText).toBe('Both:');
    expect(out.cleanText).not.toContain('intent');
  });

  it('a project given as an id stays an id', () => {
    const out = parseIntents('```intent\n{"type":"schedule","title":"X","project":"proj-ansci"}\n```');
    expect(out.schedule[0]).toMatchObject({ projectId: 'proj-ansci' });
  });

  it('malformed JSON is left visible, not swallowed', () => {
    const bad = '```intent\n{not json}\n```';
    const out = parseIntents(`Text ${bad}`);
    expect(out.schedule).toEqual([]);
    expect(out.cleanText).toContain('{not json}');
  });

  it('an unknown intent type is left visible', () => {
    const unk = '```intent\n{"type":"teleport","where":"mars"}\n```';
    const out = parseIntents(unk);
    expect(out.cleanText).toContain('teleport');
    expect(out.schedule).toEqual([]);
    expect(out.webview).toEqual([]);
  });

  it('plain text passes through unchanged (modulo trim)', () => {
    const out = parseIntents('Just a normal reply with `code` in it.');
    expect(out.cleanText).toBe('Just a normal reply with `code` in it.');
    expect(out.schedule).toEqual([]);
  });
});

describe('intentHoldbackLength', () => {
  it('passes complete text through in full', () => {
    const t = 'Hello, all streamed.';
    expect(intentHoldbackLength(t)).toBe(t.length);
  });

  it('holds an unclosed intent fence', () => {
    const t = 'Intro. ```intent\n{"type":"sched';
    expect(intentHoldbackLength(t)).toBe('Intro. '.length);
  });

  it('passes text once the fence has closed', () => {
    const t = `Intro. ${SCHEDULE} done`;
    expect(intentHoldbackLength(t)).toBe(t.length);
  });

  it('holds a trailing partial opener', () => {
    expect(intentHoldbackLength('Intro. ``')).toBe('Intro. '.length);
    expect(intentHoldbackLength('Intro. ```in')).toBe('Intro. '.length);
    expect(intentHoldbackLength('Intro. `')).toBe('Intro. '.length);
  });

  it('does not hold a trailing backtick run unrelated to a fence start', () => {
    const t = 'Use `npm test` to check';
    expect(intentHoldbackLength(t)).toBe(t.length);
  });
});
