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
});
