import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_PREFIX = 'compliance.toggle.';

export function useUrlToggle<T extends string = string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlValue = searchParams.get(key) as T | null;
  let storedValue: T | null = null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw !== null) storedValue = raw as T;
  } catch {
    /* SSR or private browsing */
  }

  const value = urlValue ?? storedValue ?? defaultValue;

  const setValue = useCallback(
    (next: T) => {
      try {
        if (next === defaultValue || next === '') {
          localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
        } else {
          localStorage.setItem(`${STORAGE_PREFIX}${key}`, next);
        }
      } catch {
        /* private browsing */
      }

      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          if (next === defaultValue || next === '') {
            params.delete(key);
          } else {
            params.set(key, next);
          }
          return params;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}
