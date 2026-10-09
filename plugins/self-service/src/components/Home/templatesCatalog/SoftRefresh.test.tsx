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

  it('re-queries the current page on invalidation then restores offset', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 20, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    expect(setOffset).toHaveBeenCalledWith(toRefreshOffset(20));

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(20),
          setOffset,
          loading: false,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    expect(setOffset).toHaveBeenCalledWith(20);
  });

  it('coalesces burst invalidations into one deferred refresh', () => {
    const setOffset = jest.fn();
    render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    expect(setOffset).toHaveBeenCalledTimes(1);
    expect(setOffset).toHaveBeenCalledWith(toRefreshOffset(0));
  });

  it('re-queues a refresh that arrived while one is in flight', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });
    expect(setOffset).toHaveBeenCalledTimes(1);
    expect(setOffset).toHaveBeenLastCalledWith(toRefreshOffset(0));

    // Still on sentinel offset + loading — restore not applied yet.
    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(0),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });
    // Dirty while in flight — do not start a second sentinel yet.
    expect(setOffset).toHaveBeenCalledTimes(1);

    // Restore completes.
    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(0),
          setOffset,
          loading: false,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );
    expect(setOffset).toHaveBeenCalledWith(0);

    // Dirty flag schedules another soft refresh after restore.
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(setOffset).toHaveBeenLastCalledWith(toRefreshOffset(0));
    expect(setOffset).toHaveBeenCalledTimes(3);
  });

  it('rewrites the URL away from the sentinel offset while refreshing', () => {
    const setOffset = jest.fn();
    window.history.replaceState(null, '', '/self-service/catalog?offset=20');

    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 20, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    // Simulate EntityListProvider syncing the sentinel offset into the URL.
    window.history.replaceState(
      null,
      '',
      `/self-service/catalog?offset=${toRefreshOffset(20)}`,
    );

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(20),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      // SoftRefresh defers URL rewrite past EntityListProvider's replaceState.
      jest.runOnlyPendingTimers();
    });

    expect(window.location.search).toBe('?offset=20');
  });
  it('normalizes a sentinel offset left in the URL on mount', () => {
    const setOffset = jest.fn();
    window.history.replaceState(
      null,
      '',
      `/self-service/catalog?offset=${toRefreshOffset(40)}`,
    );

    render(
      <MockEntityListContextProvider
        value={{ offset: toRefreshOffset(40), setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    expect(setOffset).toHaveBeenCalledWith(40);
  });
  it('clears restore marker when offset leaves the refresh band without loading', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    // Provider jumped back to a normal offset before restore effect ran.
    rerender(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    expect(setOffset).toHaveBeenCalledTimes(1);
  });

  it('re-queues after dirty when offset leaves the refresh band early', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 20, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(20),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    // Provider left the sentinel band before restore; dirty still requeues.
    rerender(
      <MockEntityListContextProvider
        value={{ offset: 20, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(setOffset).toHaveBeenLastCalledWith(toRefreshOffset(20));
  });

  it('skips applying a refresh when setOffset disappears before the timer', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
    });

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: 0,
          setOffset: undefined,
          loading: false,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(setOffset).not.toHaveBeenCalled();
  });

  it('skips mount hydrate when setOffset is missing', () => {
    expect(() =>
      render(
        <MockEntityListContextProvider
          value={{
            offset: toRefreshOffset(40),
            setOffset: undefined,
            loading: false,
          }}
        >
          <SoftRefresh />
        </MockEntityListContextProvider>,
      ),
    ).not.toThrow();
  });

  it('clears a pending URL rewrite when the sentinel offset changes', () => {
    const setOffset = jest.fn();
    const { rerender } = render(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(0),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    window.history.replaceState(
      null,
      '',
      `/self-service/catalog?offset=${toRefreshOffset(20)}`,
    );

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(20),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(window.location.search).toBe('?offset=20');
  });

  it('clears pending invalidate and URL rewrite timers on unmount', () => {
    const setOffset = jest.fn();
    const { rerender, unmount } = render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
      jest.runOnlyPendingTimers();
    });

    rerender(
      <MockEntityListContextProvider
        value={{
          offset: toRefreshOffset(0),
          setOffset,
          loading: true,
        }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    // URL rewrite timer is pending; unmount must clear it.
    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(setOffset).toHaveBeenCalledTimes(1);
  });

  it('clears a pending invalidate timer on unmount', () => {
    const setOffset = jest.fn();
    const { unmount } = render(
      <MockEntityListContextProvider
        value={{ offset: 0, setOffset, loading: false }}
      >
        <SoftRefresh />
      </MockEntityListContextProvider>,
    );

    act(() => {
      invalidateTemplatesCatalog();
    });
    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(setOffset).not.toHaveBeenCalled();
  });
});
