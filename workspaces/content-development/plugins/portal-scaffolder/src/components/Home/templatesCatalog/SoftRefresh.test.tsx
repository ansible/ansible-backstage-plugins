import { render, act } from '@testing-library/react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import { SoftRefresh } from './SoftRefresh';
import { invalidateTemplatesCatalog } from './invalidation';
import { toRefreshOffset } from './offsetRefresh';

describe('SoftRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const invalidate = () => {
    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });
  };

  it('refreshes repeatedly even when no loading transition is rendered', () => {
    const refresh = jest.fn();
    const setOffset = jest.fn();
    window.history.replaceState(null, '', '/self-service/catalog?offset=20');
    render(
      <MockEntityListContextProvider
        value={{ offset: 20, setOffset, refresh, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    // Immediately resolved requests can batch loading true/false together.
    // A later invalidation must still refresh, without moving the page or URL.
    invalidate();
    invalidate();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(setOffset).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?offset=20');
  });

  it('coalesces burst invalidations into one deferred refresh', () => {
    const refresh = jest.fn();
    render(
      <MockEntityListContextProvider value={{ refresh }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      invalidateTemplatesCatalog();
      expect(refresh).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('requests fresh data when invalidated during an in-flight fetch', () => {
    const refresh = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider value={{ refresh, loading: false }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    invalidate();
    rerender(
      <MockEntityListContextProvider value={{ refresh, loading: true }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    invalidate();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('uses the latest refresh callback when the deferred timer fires', () => {
    const previousRefresh = jest.fn();
    const refresh = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider value={{ refresh: previousRefresh }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    act(() => invalidateTemplatesCatalog());
    rerender(
      <MockEntityListContextProvider value={{ refresh }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    act(() => jest.runOnlyPendingTimers());

    expect(previousRefresh).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('clears pending work and unsubscribes on unmount', () => {
    const refresh = jest.fn();
    const { unmount } = render(
      <MockEntityListContextProvider value={{ refresh }}>
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    act(() => invalidateTemplatesCatalog());
    unmount();
    invalidate();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('normalizes a sentinel offset left in a saved URL', () => {
    const setOffset = jest.fn();
    window.history.replaceState(
      null,
      '',
      `/self-service/catalog?offset=${toRefreshOffset(40)}`,
    );
    render(
      <MockEntityListContextProvider
        value={{ offset: toRefreshOffset(40), setOffset }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    expect(setOffset).toHaveBeenCalledWith(40);
    expect(window.location.search).toBe('?offset=40');
  });

  it('tolerates contexts without optional refresh or pagination callbacks', () => {
    render(
      <MockEntityListContextProvider
        value={{
          refresh: undefined,
          setOffset: undefined,
          offset: toRefreshOffset(40),
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    expect(invalidate).not.toThrow();
  });
});
