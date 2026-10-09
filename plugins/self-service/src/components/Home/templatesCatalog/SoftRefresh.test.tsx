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

  it('skips a second refresh while one is already in flight', () => {
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
    expect(setOffset).toHaveBeenCalledTimes(1);
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
