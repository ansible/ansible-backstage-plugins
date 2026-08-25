/*
 * Copyright Red Hat
 */

import { renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { useGitRepositoriesExtensions } from './useGitRepositoriesExtensions';

describe('useGitRepositoriesExtensions', () => {
  it('returns the empty default when no factory is registered', () => {
    const { result } = renderHook(() => useGitRepositoriesExtensions());
    expect(result.current).toBeInstanceOf(DefaultGitRepositoriesExtensionsApi);
    expect(result.current.getPageTabs()).toEqual([]);
  });

  it('returns the registered guest implementation when present', () => {
    const guest = new DefaultGitRepositoriesExtensionsApi();
    const { result } = renderHook(() => useGitRepositoriesExtensions(), {
      wrapper: ({ children }) => (
        <TestApiProvider apis={[[gitRepositoriesExtensionsApiRef, guest]]}>
          {children}
        </TestApiProvider>
      ),
    });
    expect(result.current).toBe(guest);
  });
});
