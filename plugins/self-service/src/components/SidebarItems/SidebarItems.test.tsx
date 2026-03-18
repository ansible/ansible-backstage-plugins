import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  PermissionGatedSidebarItem,
  EEBuilderSidebarItem,
  CollectionsSidebarItem,
  GitRepositoriesSidebarItem,
} from './SidebarItems';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

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

describe('PermissionGatedSidebarItem', () => {
  const testPermission = {
    type: 'basic' as const,
    name: 'test.permission',
    attributes: {},
  };

  const TestIcon = () => <svg data-testid="test-icon" />;

  const defaultProps = {
    permission: testPermission,
    icon: TestIcon,
    to: '/test/path',
    text: 'Test Item',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sidebar item when permission framework is disabled', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(false)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Test Item/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test/path');
  });

  it('renders sidebar item when permission.enabled is undefined (framework off)', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(undefined)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('link', { name: /Test Item/i }),
    ).toBeInTheDocument();
  });

  it('returns null when permission framework enabled and loading', async () => {
    mockUsePermission.mockReturnValue({ loading: true, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Test Item/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('returns null when permission framework enabled and not allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Test Item/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders sidebar item when permission framework enabled and allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Test Item/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test/path');
  });

  it('calls usePermission with the provided permission', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <PermissionGatedSidebarItem {...defaultProps} />
      </TestApiProvider>,
    );

    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: testPermission,
    });
  });
});

describe('EEBuilderSidebarItem', () => {
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
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Execution Environments/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/ee');
  });

  it('renders sidebar item when permission.enabled is undefined (framework off)', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(undefined)]]}>
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('link', { name: /Execution Environments/i }),
    ).toBeInTheDocument();
  });

  it('returns null when permission framework enabled and loading', async () => {
    mockUsePermission.mockReturnValue({ loading: true, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Execution Environments/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('returns null when permission framework enabled and not allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Execution Environments/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders sidebar item when permission framework enabled and allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Execution Environments/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/ee');
  });

  it('calls usePermission with execution environments view permission', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <EEBuilderSidebarItem />
      </TestApiProvider>,
    );

    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: expect.objectContaining({
        name: 'ansible.execution-environments.view',
        type: 'basic',
      }),
    });
  });
});

describe('CollectionsSidebarItem', () => {
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
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Collections/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/collections');
  });

  it('renders sidebar item when permission.enabled is undefined (framework off)', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(undefined)]]}>
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('link', { name: /Collections/i }),
    ).toBeInTheDocument();
  });

  it('returns null when permission framework enabled and loading', async () => {
    mockUsePermission.mockReturnValue({ loading: true, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Collections/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('returns null when permission framework enabled and not allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: false });

    const { container } = await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('link', { name: /Collections/i }),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders sidebar item when permission framework enabled and allowed', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    const link = screen.getByRole('link', { name: /Collections/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/self-service/collections');
  });

  it('calls usePermission with collections view permission', async () => {
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, createMockConfigApi(true)]]}>
        <CollectionsSidebarItem />
      </TestApiProvider>,
    );

    expect(mockUsePermission).toHaveBeenCalledWith({
      permission: expect.objectContaining({
        name: 'ansible.collections.view',
        type: 'basic',
      }),
    });
  });
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
