import { SignInPage } from './SignInPage';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { rhAapAuthApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';

// Mock the SignInPage from @backstage/core-components
jest.mock('@backstage/core-components', () => ({
  SignInPage: jest.fn(props => (
    <div data-testid="mock-signin-page">
      <div>Title: {props.title}</div>
      <div>Align: {props.align}</div>
      <div>Auto: {props.auto ? 'true' : 'false'}</div>
      <div>
        Providers:
        <ul>
          {props.providers.map((provider: any, index: number) => (
            <li key={index} data-testid={`provider-${provider.id}`}>
              <div>ID: {provider.id}</div>
              <div>Title: {provider.title}</div>
              <div>Message: {provider.message}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )),
}));

describe('SignInPage', () => {
  const mockOnSignInSuccess = jest.fn();

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider apis={[[rhAapAuthApiRef, {}]]}>
        <>{children}</>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the sign-in page with correct props', async () => {
    await render(<SignInPage onSignInSuccess={mockOnSignInSuccess} />);

    // Check if the mock SignInPage is rendered with correct props
    expect(screen.getByTestId('mock-signin-page')).toBeInTheDocument();
    expect(
      screen.getByText('Title: Select a Sign-in method'),
    ).toBeInTheDocument();
    expect(screen.getByText('Align: center')).toBeInTheDocument();
    expect(screen.getByText('Auto: true')).toBeInTheDocument();
  });

  it('should render the RHAAP provider', async () => {
    await render(<SignInPage onSignInSuccess={mockOnSignInSuccess} />);

    // Check if the RHAAP provider is rendered with correct props
    const provider = screen.getByTestId('provider-rhaap');
    expect(provider).toBeInTheDocument();
    expect(screen.getByText('ID: rhaap')).toBeInTheDocument();
    expect(
      screen.getByText('Title: Ansible Automation Platform'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Message: Sign in using Ansible Automation Platform'),
    ).toBeInTheDocument();
  });
});
