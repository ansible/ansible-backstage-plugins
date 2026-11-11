import { ApiHolder, ApiRef } from '@backstage/core-plugin-api';

export function createOverridingApiHolder(
  parent: ApiHolder,
  overrides: ReadonlyArray<readonly [ApiRef<unknown>, unknown]>,
): ApiHolder {
  const overrideMap = new Map(
    overrides.map(([ref, impl]) => [ref.id, impl] as const),
  );

  return {
    get<T>(ref: ApiRef<T>): T | undefined {
      const override = overrideMap.get(ref.id);
      if (override !== undefined) {
        return override as T;
      }
      return parent.get(ref);
    },
  };
}
