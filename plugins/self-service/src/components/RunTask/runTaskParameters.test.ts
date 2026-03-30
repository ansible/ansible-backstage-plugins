import {
  findNestedBooleanTrue,
  findNestedNonEmptyString,
  resolveEeFileNameFromParameters,
  resolvePublishToScmFromParameters,
} from './runTaskParameters';

describe('resolvePublishToScmFromParameters', () => {
  it('is false when params missing', () => {
    expect(resolvePublishToScmFromParameters(undefined)).toBe(false);
    expect(resolvePublishToScmFromParameters(null)).toBe(false);
  });

  it('detects top-level publishToSCM true', () => {
    expect(resolvePublishToScmFromParameters({ publishToSCM: true })).toBe(
      true,
    );
    expect(resolvePublishToScmFromParameters({ publishToSCM: false })).toBe(
      false,
    );
  });

  it('detects nested publishToSCM true (parameter groups)', () => {
    expect(
      resolvePublishToScmFromParameters({
        publishAndBuild: { publishToSCM: true },
      }),
    ).toBe(true);
    expect(
      resolvePublishToScmFromParameters({
        publishAndBuild: { publishToSCM: false },
        other: {},
      }),
    ).toBe(false);
  });
});

describe('findNestedBooleanTrue / findNestedNonEmptyString', () => {
  it('findNestedBooleanTrue uses arbitrary field names', () => {
    expect(
      findNestedBooleanTrue({ myGroup: { pushToGit: true } }, 'pushToGit'),
    ).toBe(true);
    expect(
      findNestedBooleanTrue({ myGroup: { pushToGit: false } }, 'pushToGit'),
    ).toBe(false);
  });

  it('findNestedNonEmptyString uses arbitrary field names', () => {
    expect(
      findNestedNonEmptyString({ a: { b: { customName: 'x' } } }, 'customName'),
    ).toBe('x');
  });
});

describe('resolveEeFileNameFromParameters', () => {
  it('returns undefined when missing', () => {
    expect(resolveEeFileNameFromParameters(undefined)).toBeUndefined();
  });

  it('reads top-level eeFileName', () => {
    expect(resolveEeFileNameFromParameters({ eeFileName: 'my-ee' })).toBe(
      'my-ee',
    );
  });

  it('reads nested eeFileName', () => {
    expect(
      resolveEeFileNameFromParameters({
        publishAndBuild: { eeFileName: 'nested-ee' },
      }),
    ).toBe('nested-ee');
  });
});
