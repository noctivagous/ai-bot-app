import { describe, expect, it } from 'vitest';
import { derivePhase } from './derivePhase';
import type { AdapterCheck, CheckState } from './types';

function check(id: string, required: boolean, state: CheckState): AdapterCheck {
  return { id, label: id, required, state };
}

/** The §6.2 shared checklist, all in one state unless overridden. */
function checklist(
  overrides: Record<string, CheckState> = {},
  base: CheckState = 'pass',
): AdapterCheck[] {
  const defs: Array<[string, boolean]> = [
    ['bridge', true],
    ['extension', true],
    ['tab', true],
    ['page', true],
    ['auth', true],
    ['composer', true],
    ['messageList', true],
    ['observer', true],
    ['approvals', false],
    ['activity', false],
  ];
  return defs.map(([id, required]) => check(id, required, overrides[id] ?? base));
}

describe('derivePhase — §6.3 derivation table', () => {
  it('connect() never called (channel idle) → unconfigured, whatever the checks say', () => {
    expect(derivePhase(checklist({}, 'pending'), 'idle')).toBe('unconfigured');
    expect(derivePhase(checklist(), 'idle')).toBe('unconfigured');
    expect(derivePhase([], 'idle')).toBe('unconfigured');
  });

  it('connect in flight, any required check still pending → connecting', () => {
    expect(derivePhase(checklist({ composer: 'pending' }), 'open')).toBe('connecting');
    expect(derivePhase(checklist({}, 'pending'), 'open')).toBe('connecting');
    // some passed, rest pending — still connecting
    expect(derivePhase(checklist({ bridge: 'pass', extension: 'pending' }, 'pending'), 'open')).toBe(
      'connecting',
    );
  });

  it('any required check fail → error', () => {
    expect(derivePhase(checklist({ auth: 'fail' }), 'open')).toBe('error');
    expect(derivePhase(checklist({ composer: 'fail' }), 'open')).toBe('error');
    // fail wins over still-pending checks (the connect script stops at the failure)
    expect(derivePhase(checklist({ auth: 'fail', composer: 'pending', observer: 'pending' }), 'open')).toBe(
      'error',
    );
  });

  it('all required pass + any optional warn → degraded', () => {
    expect(derivePhase(checklist({ approvals: 'warn' }), 'open')).toBe('degraded');
    expect(derivePhase(checklist({ activity: 'warn' }), 'open')).toBe('degraded');
  });

  it('all required pass + any optional fail → degraded (not error)', () => {
    expect(derivePhase(checklist({ approvals: 'fail' }), 'open')).toBe('degraded');
    expect(derivePhase(checklist({ activity: 'fail' }), 'open')).toBe('degraded');
  });

  it('all checks pass → ready', () => {
    expect(derivePhase(checklist(), 'open')).toBe('ready');
  });

  it('channel closes after ready → disconnected', () => {
    expect(derivePhase(checklist(), 'closed')).toBe('disconnected');
  });

  it('channel closes after degraded → disconnected', () => {
    expect(derivePhase(checklist({ approvals: 'warn' }), 'closed')).toBe('disconnected');
  });

  it('a required fail is reported as error even if the channel also closed', () => {
    expect(derivePhase(checklist({ auth: 'fail' }), 'closed')).toBe('error');
  });

  it("required 'skip' counts as settled — does not block ready", () => {
    expect(derivePhase(checklist({ observer: 'skip' }), 'open')).toBe('ready');
  });

  it("optional 'skip' does not degrade", () => {
    expect(derivePhase(checklist({ approvals: 'skip', activity: 'skip' }), 'open')).toBe('ready');
  });

  it('empty checklist on an open channel → ready (nothing blocks, nothing warns)', () => {
    expect(derivePhase([], 'open')).toBe('ready');
  });
});
