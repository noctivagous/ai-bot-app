// Intent parsing (DESIGN.md §10, §11 slice 7) — shared by both adapters.
//
// A bot message may carry fenced ```intent blocks with one JSON object:
//
//   ```intent
//   {"type":"schedule","title":"Planning session","day":2,"project":"Chinese Book"}
//   ```
//   ```intent
//   {"type":"webview","title":"Map outline","ref":"art-chinese-map"}
//   ```
//
// Adapters extract them from the message stream and emit intent.schedule
// / intent.webview events; the block is stripped from the displayed
// text. A fence whose body is not valid JSON, or whose type is unknown,
// is NOT an intent: it stays in the text, visible and honest, rather
// than being silently swallowed.

import type { ScheduleIntent } from './types';

export interface WebviewIntent {
  ref: string;
  title?: string;
}

export interface ParsedIntents {
  cleanText: string;
  schedule: ScheduleIntent[];
  webview: WebviewIntent[];
}

const FENCE_RE = /```intent[ \t]*\n([\s\S]*?)```/g;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function parseIntents(text: string): ParsedIntents {
  const schedule: ScheduleIntent[] = [];
  const webview: WebviewIntent[] = [];
  const cleanText = text
    .replace(FENCE_RE, (whole, body: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.trim());
      } catch {
        return whole; // not valid JSON — leave the fence in the text
      }
      const obj = asRecord(parsed);
      if (!obj) return whole;
      if (obj.type === 'schedule' && typeof obj.title === 'string' && obj.title.trim()) {
        const project = typeof obj.project === 'string' ? obj.project : undefined;
        schedule.push({
          title: obj.title.trim(),
          ...(typeof obj.day === 'number' ? { day: obj.day } : {}),
          ...(typeof obj.when === 'string' ? { when: obj.when } : {}),
          ...(project
            ? project.startsWith('proj-')
              ? { projectId: project }
              : { projectName: project }
            : {}),
        });
        return '';
      }
      if (obj.type === 'webview' && typeof obj.ref === 'string' && obj.ref.trim()) {
        webview.push({
          ref: obj.ref.trim(),
          ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
        });
        return '';
      }
      return whole; // unknown intent type — leave it visible
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanText, schedule, webview };
}

/**
 * Streaming holdback: when a message is still arriving, a trailing
 * partial intent fence must not leak into the displayed deltas. Returns
 * the length of the longest prefix of `text` that is safe to display —
 * everything before an unclosed ```intent fence, and before a trailing
 * run of backticks / partial "```intent" opener that could still grow
 * into one.
 */
export function intentHoldbackLength(text: string): number {
  // An unclosed intent fence: the last ```intent opener with no closer.
  const opener = '```intent';
  let idx = text.lastIndexOf(opener);
  if (idx >= 0) {
    const after = text.slice(idx + opener.length);
    if (!after.includes('```')) return idx; // fence still open — hold from here
  }
  // A trailing partial opener: text ends with a prefix of "```intent"
  // (e.g. "`", "``", "```", "```in") that is not already a closed fence.
  for (let len = Math.min(opener.length - 1, text.length); len >= 1; len--) {
    const tail = text.slice(text.length - len);
    if (opener.startsWith(tail)) {
      // If this tail is the start of a COMPLETE fence line already
      // handled above, lastIndexOf logic covered it; a bare trailing
      // partial is held.
      return text.length - len;
    }
  }
  return text.length;
}
