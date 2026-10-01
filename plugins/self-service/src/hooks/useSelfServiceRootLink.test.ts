import { renderHook } from '@testing-library/react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { useSelfServiceRootLink } from './useSelfServiceRootLink';
import { SELF_SERVICE_ROOT_PATH } from '../routes';

jest.mock('@backstage/core-plugin-api', () => {
  const actual = jest.requireActual('@backstage/core-plugin-api');
  return {
    ...actual,
    useRouteRef: jest.fn(),
  };
});

describe('useSelfServiceRootLink', () => {
  it('uses the mounted route ref when bound', () => {
    (useRouteRef as jest.Mock).mockReturnValue(() => '/custom-self-service');
    const { result } = renderHook(() => useSelfServiceRootLink());
    expect(result.current()).toBe('/custom-self-service');
  });

  it('falls back to /self-service when the root route ref is unbound', () => {
    (useRouteRef as jest.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => useSelfServiceRootLink());
    expect(result.current()).toBe(SELF_SERVICE_ROOT_PATH);
  });
});
