import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import { ContentExpandableSidebarGroup } from './ContentExpandableSidebarGroup';
import { contentQualityNavSearch } from './contentNav';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  useSidebarOpenState: () => ({ isOpen: true }),
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockUseLocation(),
}));

describe('ContentExpandableSidebarGroup', () => {
  beforeEach(() => {
    mockUseLocation.mockReturnValue({
      pathname: '/self-service/repositories/quality',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });
  });

  it('highlights Git Repositories when Quality tab opened from page tabs', async () => {
    await renderInTestApp(<ContentExpandableSidebarGroup />);

    expect(screen.getByRole('button', { name: 'Content' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      screen.getByRole('link', { name: /Git Repositories/i }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: /Content quality/i }),
    ).not.toHaveAttribute('aria-current');
  });

  it('highlights Content Quality when opened from the sidebar link', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/self-service/repositories/quality',
      search: contentQualityNavSearch(),
      hash: '',
      state: null,
      key: 'default',
    });

    await renderInTestApp(<ContentExpandableSidebarGroup />);

    expect(
      screen.getByRole('link', { name: /Content quality/i }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: /Git Repositories/i }),
    ).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Content quality/i })).toHaveAttribute(
      'href',
      '/self-service/repositories/quality?contentNav=content-quality',
    );
  });

  it('scrolls expanded child items into view when Content is opened', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/self-service/catalog',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    const scrollIntoView = jest.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    jest.useFakeTimers();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0);
      return 0;
    });

    try {
      await renderInTestApp(<ContentExpandableSidebarGroup />);

      fireEvent.click(screen.getByRole('button', { name: 'Content' }));

      expect(screen.getByRole('button', { name: 'Content' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'end',
        inline: 'nearest',
        behavior: 'smooth',
      });

      jest.advanceTimersByTime(350);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      jest.restoreAllMocks();
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      jest.useRealTimers();
    }
  });
});
