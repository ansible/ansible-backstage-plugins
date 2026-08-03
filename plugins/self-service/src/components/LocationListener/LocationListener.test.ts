import { renderHook } from '@testing-library/react';

const mockNavigate = jest.fn();
let mockPathname = '/';

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
}));

import { LocationListener } from './LocationListener';

describe('LocationListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
  });

  it('redirects / to /self-service/catalog', () => {
    mockPathname = '/';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog', {
      replace: true,
    });
  });

  it('redirects /create to /self-service/catalog', () => {
    mockPathname = '/create';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog', {
      replace: true,
    });
  });

  it('redirects /create/templates/<namespace>/<name> to self-service', () => {
    mockPathname = '/create/templates/default/my-template';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/create/templates/default/my-template',
      { replace: true },
    );
  });

  it('redirects /create/tasks to /self-service/create/tasks', () => {
    mockPathname = '/create/tasks';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/create/tasks', {
      replace: true,
    });
  });

  it('redirects /create/tasks/<id> to /self-service/create/tasks/<id>', () => {
    mockPathname = '/create/tasks/abc123';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/create/tasks/abc123',
      { replace: true },
    );
  });

  it('redirects catch-all /create/* to /self-service/catalog', () => {
    mockPathname = '/create/something-else';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog', {
      replace: true,
    });
  });

  it('redirects /catalog-import to /self-service/catalog-import', () => {
    mockPathname = '/catalog-import';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog-import', {
      replace: true,
    });
  });

  it('redirects /catalog/default/template/<name> to self-service catalog', () => {
    mockPathname = '/catalog/default/template/my-template';
    renderHook(() => LocationListener());
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/catalog/default/my-template',
      { replace: true },
    );
  });

  it('does not redirect unrelated paths', () => {
    mockPathname = '/settings';
    renderHook(() => LocationListener());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns null (renders nothing)', () => {
    mockPathname = '/settings';
    const { result } = renderHook(() => LocationListener());
    expect(result.current).toBeNull();
  });
});
