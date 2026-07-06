import {
  getVerbosityObject,
  getVerbosityLevels,
  TERMINAL_JOB_STATUSES,
} from './constants';

describe('verbosity helpers', () => {
  it('getVerbosityObject returns correct object for valid level', () => {
    expect(getVerbosityObject(0)).toEqual({ id: 0, name: '0 (Normal)' });
    expect(getVerbosityObject(3)).toEqual({ id: 3, name: '3 (Debug)' });
    expect(getVerbosityObject(5)).toEqual({ id: 5, name: '5 (WinRM Debug)' });
  });

  it('getVerbosityObject returns undefined name for out-of-range level', () => {
    // Negative index
    expect(getVerbosityObject(-1)).toEqual({ id: -1, name: undefined });
    // Beyond array length
    expect(getVerbosityObject(10)).toEqual({ id: 10, name: undefined });
  });

  it('getVerbosityLevels returns full mapped list', () => {
    const levels = getVerbosityLevels();
    expect(levels).toHaveLength(6);
    expect(levels[0]).toEqual({ id: 0, name: '0 (Normal)' });
    expect(levels[5]).toEqual({ id: 5, name: '5 (WinRM Debug)' });

    // All ids should match their index
    levels.forEach((level, idx) => {
      expect(level.id).toBe(idx);
      expect(typeof level.name).toBe('string');
    });
  });
});

describe('TERMINAL_JOB_STATUSES', () => {
  it('contains expected terminal statuses', () => {
    expect(TERMINAL_JOB_STATUSES).toEqual(
      new Set(['successful', 'failed', 'error', 'canceled']),
    );
  });

  it('does not match non-terminal statuses', () => {
    expect(TERMINAL_JOB_STATUSES.has('running')).toBe(false);
    expect(TERMINAL_JOB_STATUSES.has('pending')).toBe(false);
    expect(TERMINAL_JOB_STATUSES.has('waiting')).toBe(false);
  });
});
