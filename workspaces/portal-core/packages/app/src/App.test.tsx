import { render, screen, waitFor } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router-dom';
import App from './App';
import { useEffect } from 'react';
import { mockApis } from '@backstage/test-utils';
import type { IdentityApi } from '@backstage/core-plugin-api';

jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  SignInPage: ({
    onSignInSuccess,
  }: {
    onSignInSuccess: (identity: IdentityApi) => void;
  }) => {
    useEffect(() => {
      onSignInSuccess(mockApis.identity());
    }, [onSignInSuccess]);
    return null;
  },
}));

jest.mock('@ansible/plugin-automation-content', () => ({
  ...jest.requireActual('@ansible/plugin-automation-content'),
  AutomationContentEEPage: () => {
    const { pathname, search, hash } = useLocation();
    return (
      <div data-testid="destination" data-navigation={useNavigationType()}>
        {pathname + search + hash}
      </div>
    );
  },
}));

describe('App', () => {
  beforeEach(() => {
    process.env = {
      NODE_ENV: 'test',
      APP_CONFIG: [
        {
          data: {
            app: { title: 'Test' },
            backend: { baseUrl: 'http://localhost:7007' },
            techdocs: {
              storageUrl: 'http://localhost:7007/api/techdocs/static/docs',
            },
          },
          context: 'test',
        },
      ] as any,
    };
  });

  it('should render', async () => {
    const rendered = render(<App />);

    await waitFor(() => {
      expect(rendered.baseElement).toBeInTheDocument();
    });
  });

  it.each([
    ['/content', '/content/ee'],
    ['/automation-content', '/content/ee'],
    ['/automation-content/execution-environments', '/content/ee'],
    [
      '/automation-content/execution-environments/registry%2Fdemo%40sha256%3A123',
      '/content/ee/registry%2Fdemo%40sha256%3A123',
    ],
  ])('preserves query/hash with replace at %s', async (path, destination) => {
    window.history.replaceState({}, '', `${path}?tag=latest%20tag#details`);
    render(<App />);
    const target = await screen.findByTestId('destination');
    expect(target.textContent).toBe(`${destination}?tag=latest%20tag#details`);
    expect(target.getAttribute('data-navigation')).toBe('REPLACE');
  });
});
