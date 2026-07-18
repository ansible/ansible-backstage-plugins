/*
 * Copyright Red Hat
 */

import { mustRemediateBeforePush } from './mustRemediateBeforePush';

describe('mustRemediateBeforePush', () => {
  it('requires remedia when there is no activity id', () => {
    expect(
      mustRemediateBeforePush({
        targetIds: new Set([1, 2]),
        generatedIds: new Set([1, 2]),
        activityId: null,
      }),
    ).toBe(true);
  });

  it('requires remedia when selection is empty', () => {
    expect(
      mustRemediateBeforePush({
        targetIds: new Set(),
        generatedIds: new Set([1]),
        activityId: 'act-1',
      }),
    ).toBe(true);
  });

  it('requires remedia when selection is a subset of a prior bulk remedia', () => {
    expect(
      mustRemediateBeforePush({
        targetIds: new Set([1, 2]),
        generatedIds: new Set([1, 2, 3]),
        activityId: 'act-bulk',
      }),
    ).toBe(true);
  });

  it('requires remedia when selection includes ids not yet generated', () => {
    expect(
      mustRemediateBeforePush({
        targetIds: new Set([1, 2, 99]),
        generatedIds: new Set([1, 2]),
        activityId: 'act-1',
      }),
    ).toBe(true);
  });

  it('skips remedia only when selection exactly matches the last generated set', () => {
    expect(
      mustRemediateBeforePush({
        targetIds: new Set([10, 20]),
        generatedIds: new Set([20, 10]),
        activityId: 'act-exact',
      }),
    ).toBe(false);
  });
});
