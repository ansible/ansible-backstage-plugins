import { render, cleanup } from '@testing-library/react';
import { LocationListener } from './LocationListener';
import { useLocation } from 'react-router-dom';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: jest.fn(),
}));

describe('LocationListener', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    cleanup();
  });

  it('redirects / and /create to /self-service/catalog', () => {
    const locations = ['/', '/create'];
    locations.forEach(path => {
      (useLocation as jest.Mock).mockReturnValue({ pathname: path });
      render(<LocationListener />);
      expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog', {
        replace: true,
      });
      mockNavigate.mockClear();
      cleanup();
    });
  });

  it('redirects /create/templates/:namespace/:templateName to self-service equivalents', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/create/templates/default/my-job-template',
    });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/create/templates/default/my-job-template',
      { replace: true },
    );
  });

  it('redirects /create/tasks and /create/tasks/:taskId correctly', () => {
    (useLocation as jest.Mock).mockReturnValue({ pathname: '/create/tasks' });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/create/tasks', {
      replace: true,
    });

    mockNavigate.mockClear();
    cleanup();

    // Test with actual task ID, not literal :taskId
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/create/tasks/abc123-task-id',
    });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/create/tasks/abc123-task-id',
      { replace: true },
    );
  });

  it('redirects any unknown /create/* paths to /self-service/catalog', () => {
    // Test catch-all for unexpected /create/* paths
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/create/some/unknown/path',
    });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog', {
      replace: true,
    });
  });

  it('redirects /catalog-import correctly', () => {
    (useLocation as jest.Mock).mockReturnValue({ pathname: '/catalog-import' });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog-import', {
      replace: true,
    });
  });

  it('hides links for /self-service/catalog-import', () => {
    jest.useFakeTimers();

    // Mock document.evaluate to return fake elements
    const element1 = document.createElement('div');
    const element2 = document.createElement('div');
    const evaluateMock = jest
      .spyOn(document, 'evaluate')
      .mockImplementation(xpath => {
        return {
          singleNodeValue: xpath.toString().includes('a[1]')
            ? element1
            : element2,
        } as any;
      });

    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/self-service/catalog-import',
    });
    render(<LocationListener />);

    jest.advanceTimersByTime(500);

    expect(element1.style.display).toBe('none');
    expect(element2.style.display).toBe('none');

    jest.useRealTimers();
    evaluateMock.mockRestore();
  });

  it('redirects /catalog/default/template/:templateName correctly', () => {
    const templateName = 'my-template';
    (useLocation as jest.Mock).mockReturnValue({
      pathname: `/catalog/default/template/${templateName}`,
    });
    render(<LocationListener />);
    expect(mockNavigate).toHaveBeenCalledWith(
      `/self-service/catalog/default/${templateName}`,
      { replace: true },
    );
  });

  describe('multi-org namespace support', () => {
    it('redirects /catalog/:namespace/template/:name with org-scoped namespace', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/catalog/engineering/template/deploy-app',
      });
      render(<LocationListener />);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/self-service/catalog/engineering/deploy-app',
        { replace: true },
      );
    });

    it('redirects /catalog/aap-default/template/:name for AAP Default org', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/catalog/aap-default/template/deploy-app',
      });
      render(<LocationListener />);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/self-service/catalog/aap-default/deploy-app',
        { replace: true },
      );
    });

    it('redirects /create/templates/:namespace/:name with org-scoped namespace', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/create/templates/platform-ops/deploy-app',
      });
      render(<LocationListener />);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/self-service/create/templates/platform-ops/deploy-app',
        { replace: true },
      );
    });

    it('preserves namespace in /catalog redirect for multi-word org names', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/catalog/platform-ops/template/network-backup',
      });
      render(<LocationListener />);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/self-service/catalog/platform-ops/network-backup',
        { replace: true },
      );
    });
  });
});
