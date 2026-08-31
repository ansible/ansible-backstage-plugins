/*
 * Copyright Red Hat
 */

import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import { ContentQualityPage, ContentQualityRoutesPage } from './ContentQualityPage';

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

const mockUseGitRepositoriesExtensions = jest.fn();

jest.mock('../GitRepositories/useGitRepositoriesExtensions', () => ({
  useGitRepositoriesExtensions: (...args: unknown[]) =>
    mockUseGitRepositoriesExtensions(...args),
}));

describe('ContentQualityPage', () => {
  beforeEach(() => {
    mockUseGitRepositoriesExtensions.mockReturnValue({
      getPageTabs: () => [],
    });
  });

  it('renders standalone page with header and fallback content', async () => {
    await renderInTestApp(<ContentQualityPage />);

    expect(screen.getByText('Content quality')).toBeInTheDocument();
    expect(
      screen.getByText('Estate-Wide Content Quality'),
    ).toBeInTheDocument();
  });

  it('renders with permission gate via ContentQualityRoutesPage', async () => {
    await renderInTestApp(<ContentQualityRoutesPage />);

    expect(screen.getByText('Content quality')).toBeInTheDocument();
  });

  it('renders quality tab content when APME extension provides it', async () => {
    const mockRender = jest.fn(() => (
      <div data-testid="quality-tab-content">Fleet quality data</div>
    ));

    mockUseGitRepositoriesExtensions.mockReturnValue({
      getPageTabs: () => [
        {
          id: 'quality',
          label: 'Quality',
          path: 'quality',
          order: 1,
          render: mockRender,
        },
      ],
    });

    await renderInTestApp(<ContentQualityPage />);

    expect(screen.getByTestId('quality-tab-content')).toBeInTheDocument();
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryDetailPath: expect.any(Function),
      }),
    );
  });
});
