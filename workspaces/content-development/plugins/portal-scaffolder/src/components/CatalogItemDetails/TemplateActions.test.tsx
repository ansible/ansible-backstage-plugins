import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { TemplateActions } from './TemplateActions';
import { rootRouteRef } from '../../routes';

const mockUsePermission = jest.fn();
const mockUseEntityPermission = jest.fn();

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: (...args: unknown[]) =>
    mockUsePermission(...(args as Parameters<typeof mockUsePermission>)),
}));

jest.mock('@backstage/plugin-catalog-react/alpha', () => ({
  useEntityPermission: (...args: unknown[]) =>
    mockUseEntityPermission(
      ...(args as Parameters<typeof mockUseEntityPermission>),
    ),
}));

const mockNavigate = jest.fn();
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ namespace: 'default', templateName: 'my-template' }),
}));

const renderComponent = (onUnregisterClick = jest.fn()) =>
  renderInTestApp(<TemplateActions onUnregisterClick={onUnregisterClick} />, {
    mountedRoutes: {
      '/self-service': rootRouteRef,
    },
  });

describe('TemplateActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePermission.mockReturnValue({ allowed: true, loading: false });
    mockUseEntityPermission.mockReturnValue({
      allowed: true,
      loading: false,
      error: undefined,
    });
  });

  it('renders Launch button when user has taskCreatePermission', async () => {
    await renderComponent();
    expect(screen.getByText('Launch')).toBeInTheDocument();
  });

  it('hides Launch button when user lacks taskCreatePermission', async () => {
    mockUsePermission.mockReturnValue({ allowed: false, loading: false });
    await renderComponent();
    expect(screen.queryByText('Launch')).not.toBeInTheDocument();
  });

  it('renders Unregister Template button when user has delete permission', async () => {
    await renderComponent();
    expect(screen.getByText('Unregister Template')).toBeInTheDocument();
  });

  it('hides Unregister Template button when user lacks delete permission', async () => {
    mockUseEntityPermission.mockReturnValue({
      allowed: false,
      loading: false,
      error: undefined,
    });
    await renderComponent();
    expect(screen.queryByText('Unregister Template')).not.toBeInTheDocument();
  });

  it('hides Unregister Template button when permission check has error', async () => {
    mockUseEntityPermission.mockReturnValue({
      allowed: true,
      loading: false,
      error: new Error('permission error'),
    });
    await renderComponent();
    expect(screen.queryByText('Unregister Template')).not.toBeInTheDocument();
  });

  it('calls onUnregisterClick when Unregister Template is clicked', async () => {
    const onUnregisterClick = jest.fn();
    await renderComponent(onUnregisterClick);

    screen.getByText('Unregister Template').click();
    expect(onUnregisterClick).toHaveBeenCalledTimes(1);
  });

  it('navigates when Launch button is clicked', async () => {
    await renderComponent();

    screen.getByText('Launch').click();
    expect(mockNavigate).toHaveBeenCalled();
  });
});
