import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import {
  FieldValidationProvider,
  useFieldValidation,
} from './FieldValidationContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <FieldValidationProvider>{children}</FieldValidationProvider>
);

describe('useFieldValidation', () => {
  it('returns default values when used outside provider', () => {
    const { result } = renderHook(() => useFieldValidation());

    expect(result.current.hasErrors).toBe(false);
    expect(result.current.submitAttempted).toBe(false);
    expect(typeof result.current.setFieldError).toBe('function');
    expect(typeof result.current.notifySubmitAttempted).toBe('function');
    expect(typeof result.current.resetSubmitAttempted).toBe('function');
  });

  it('returns initial state with no errors', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    expect(result.current.hasErrors).toBe(false);
    expect(result.current.submitAttempted).toBe(false);
  });

  it('sets hasErrors to true when a field error is added', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    act(() => {
      result.current.setFieldError('field-1', true);
    });

    expect(result.current.hasErrors).toBe(true);
  });

  it('sets hasErrors to false when the error is removed', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    act(() => {
      result.current.setFieldError('field-1', true);
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.setFieldError('field-1', false);
    });
    expect(result.current.hasErrors).toBe(false);
  });

  it('tracks multiple field errors independently', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    act(() => {
      result.current.setFieldError('field-1', true);
      result.current.setFieldError('field-2', true);
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.setFieldError('field-1', false);
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.setFieldError('field-2', false);
    });
    expect(result.current.hasErrors).toBe(false);
  });

  it('does not trigger re-render when setting same error state', () => {
    const renderCount = { current: 0 };
    const { result } = renderHook(
      () => {
        renderCount.current += 1;
        return useFieldValidation();
      },
      { wrapper },
    );

    act(() => {
      result.current.setFieldError('field-1', true);
    });

    const countAfterSet = renderCount.current;

    act(() => {
      result.current.setFieldError('field-1', true);
    });

    expect(renderCount.current).toBe(countAfterSet);
  });

  it('sets submitAttempted to true via notifySubmitAttempted', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    expect(result.current.submitAttempted).toBe(false);

    act(() => {
      result.current.notifySubmitAttempted();
    });

    expect(result.current.submitAttempted).toBe(true);
  });

  it('resets submitAttempted to false via resetSubmitAttempted', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    act(() => {
      result.current.notifySubmitAttempted();
    });
    expect(result.current.submitAttempted).toBe(true);

    act(() => {
      result.current.resetSubmitAttempted();
    });
    expect(result.current.submitAttempted).toBe(false);
  });

  it('handles setting error for a field that was never registered', () => {
    const { result } = renderHook(() => useFieldValidation(), { wrapper });

    act(() => {
      result.current.setFieldError('nonexistent', false);
    });

    expect(result.current.hasErrors).toBe(false);
  });
});
