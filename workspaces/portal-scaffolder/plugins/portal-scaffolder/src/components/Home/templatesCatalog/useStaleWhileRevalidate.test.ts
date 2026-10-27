import { renderHook } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { useStaleWhileRevalidate } from './useStaleWhileRevalidate';
import { toRefreshOffset } from './offsetRefresh';

const entity = (name: string): Entity =>
  ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Template',
    metadata: { name, uid: name },
  }) as Entity;

describe('useStaleWhileRevalidate', () => {
  it('shows skeletons only before the first successful page', () => {
    const { result } = renderHook(() =>
      useStaleWhileRevalidate({
        entities: [],
        totalItems: 0,
        offset: 0,
        loading: true,
      }),
    );
    expect(result.current.showInitialSkeleton).toBe(true);
  });

  it('keeps the previous page while a soft refresh is in flight', () => {
    const page = [entity('a'), entity('b')];
    const { result, rerender } = renderHook(
      ({ entities, offset, loading, totalItems }) =>
        useStaleWhileRevalidate({ entities, offset, loading, totalItems }),
      {
        initialProps: {
          entities: page,
          totalItems: 40,
          offset: 20,
          loading: false,
        },
      },
    );

    rerender({
      entities: [],
      totalItems: 40,
      offset: toRefreshOffset(20),
      loading: true,
    });

    expect(result.current.showInitialSkeleton).toBe(false);
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.displayEntities).toEqual(page);
    expect(result.current.displayOffset).toBe(20);
  });
});
