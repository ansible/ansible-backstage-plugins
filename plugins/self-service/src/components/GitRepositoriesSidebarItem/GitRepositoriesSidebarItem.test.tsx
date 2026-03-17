import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { GitRepositoriesSidebarItem } from './GitRepositoriesSidebarItem';

const mockUsePermission = jest.fn();
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}));

const createMockConfigApi = (permissionEnabled: boolean | undefined) => ({
  getOptionalBoolean: jest.fn((key: string) =>
    key === 'permission.enabled' ? permissionEnabled : undefined,
  ),
  getString: jest.fn(),
  getOptionalString: jest.fn(),
  getConfig: jest.fn(),
  getOptionalConfig: jest.fn(),
  getConfigArray: jest.fn(),
  getOptionalConfigArray: jest.fn(),
  getNumber: jest.fn(),
  getOptionalNumber: jest.fn(),
  getBoolean: jest.fn(),
  getStringArray: jest.fn(),
  getOptionalStringArray: jest.fn(),
  keys: jest.fn(),
  has: jest.fn(),
});

describe('GitRepositoriesSidebarItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sidebar item when permission framework is disabled', async () => {
    mockUsePermission.mockReturnValue({
      loading: false,
      allowed: false,
    });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(false)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Git Repositories/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/repositories');
  });

  it('renders sidebar item when permission.enabled is undefined (framework off)', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(undefined)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('link', { name: /Git Repositories/i }),
    ).toBeInTheDocument();
  });

  it('returns null when permission framework enabled and loading', async () => {
    mockUsePermission.mockReturnValue({ loading: true, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Git Repositories/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('returns null when permission framework enabled and not allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Git Repositories/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders sidebar item when permission framework enabled and allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Git Repositories/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/repositories');
  });

  it('calls usePermission with git repositories view permission', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <GitRepositoriesSidebarItem />
      </TestApiProvider>,
    );

    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: expect.objectContaining({
        name: 'ansible.git-repositories.view',
        type: 'basic',
      }),
    });
  });
});
