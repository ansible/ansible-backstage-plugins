import { renderHook, act } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  it('returns correct initial state', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 50, pageSize: 10, resetDeps: [] }),
    );

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(10);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPrevPage).toBe(false);
  });

  it('computes totalPages as at least 1 when totalItems is 0', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 0, pageSize: 10, resetDeps: [] }),
    );

    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('rounds up totalPages for partial pages', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 15, pageSize: 10, resetDeps: [] }),
    );

    expect(result.current.totalPages).toBe(2);
  });

  it('navigates to a specific page with goToPage', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 50, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.goToPage(3));

    expect(result.current.currentPage).toBe(3);
    expect(result.current.startIndex).toBe(20);
    expect(result.current.endIndex).toBe(30);
  });

  it('clamps goToPage to not exceed totalPages', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.goToPage(100));

    expect(result.current.currentPage).toBe(3);
  });

  it('clamps goToPage to minimum of 1', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.goToPage(0));
    expect(result.current.currentPage).toBe(1);

    act(() => result.current.goToPage(-5));
    expect(result.current.currentPage).toBe(1);
  });

  it('increments page with nextPage', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(2);
    expect(result.current.hasPrevPage).toBe(true);

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(3);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('stops nextPage at the last page', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 20, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(2);

    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(2);
  });

  it('decrements page with prevPage', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.goToPage(3));
    act(() => result.current.prevPage());

    expect(result.current.currentPage).toBe(2);
  });

  it('stops prevPage at page 1', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 30, pageSize: 10, resetDeps: [] }),
    );

    act(() => result.current.prevPage());
    expect(result.current.currentPage).toBe(1);
  });

  it('resets to page 1 when resetDeps change', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: unknown[] }) =>
        usePagination({ totalItems: 50, pageSize: 10, resetDeps: deps }),
      { initialProps: { deps: ['a'] } },
    );

    act(() => result.current.goToPage(4));
    expect(result.current.currentPage).toBe(4);

    rerender({ deps: ['b'] });
    expect(result.current.currentPage).toBe(1);
  });

  it('handles single page correctly', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 5, pageSize: 10, resetDeps: [] }),
    );

    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.hasPrevPage).toBe(false);
  });
});
