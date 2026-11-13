import { BehaviorSubject } from 'rxjs';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  SessionState,
  githubAuthApiRef,
  gitlabAuthApiRef,
  identityApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import aapAppAuth from './alpha';
import { createAapSettingsModule } from './settings';
import { rhAapAuthApiRef } from './api';

// Backstage's session contract includes the TC39 observable symbol.
class ProviderSession extends BehaviorSubject<SessionState> {
  [Symbol.observable]() {
    return this;
  }
}

function provider(state: SessionState, displayName: string) {
  const session = new ProviderSession(state);
  return {
    sessionState$: () => session,
    getProfile: jest
      .fn()
      .mockImplementation(async () =>
        session.value === SessionState.SignedIn ? { displayName } : undefined,
      ),
    signIn: jest
      .fn()
      .mockImplementation(async () => session.next(SessionState.SignedIn)),
    signOut: jest
      .fn()
      .mockImplementation(async () => session.next(SessionState.SignedOut)),
  };
}

async function compose({
  hideSettings = false,
  state = SessionState.SignedIn,
}: {
  hideSettings?: boolean;
  state?: SessionState;
} = {}) {
  const auth = provider(state, 'AAP user');
  const identity = { signOut: jest.fn() };
  const errors = { post: jest.fn() };
  const config = {
    backend: { baseUrl: 'http://localhost:7007' },
    app: {
      extensions: hideSettings
        ? [{ 'auth-provider-settings:app/rhaap': false }]
        : [],
    },
    auth: { providers: { github: {}, gitlab: {}, rhaap: {} } },
  };
  await renderTestApp({
    features: [userSettingsPlugin, aapAppAuth],
    config,
    apis: [
      [rhAapAuthApiRef, auth],
      [githubAuthApiRef, provider(SessionState.SignedIn, 'GitHub user')],
      [gitlabAuthApiRef, provider(SessionState.SignedIn, 'GitLab user')],
      [identityApiRef, identity],
      [errorApiRef, errors],
    ],
    initialRouteEntries: ['/settings/auth-providers'],
  });
  return { auth, identity, errors };
}

function aapRow() {
  const row = screen.getByText('Ansible Automation Platform').closest('li');
  if (!row) throw new Error('AAP provider row is missing');
  return within(row);
}

it('leaves a host without the user-settings plugin usable', async () => {
  await renderTestApp({
    features: [aapAppAuth],
    extensions: [
      PageBlueprint.make({
        name: 'host',
        params: {
          path: '/host',
          loader: async () => <div>Host without Settings</div>,
        },
      }),
    ],
    initialRouteEntries: ['/host'],
  });
  expect(await screen.findByText('Host without Settings')).toBeInTheDocument();
});

it('keeps native provider settings unchanged when the host explicitly disables its extension', async () => {
  await compose({ hideSettings: true });
  expect(await screen.findByText('GitHub')).toBeInTheDocument();
  expect(screen.getByText('GitLab')).toBeInTheDocument();
  expect(
    screen.queryByText('Ansible Automation Platform'),
  ).not.toBeInTheDocument();
});

it('adds AAP account details alongside GitHub and GitLab without extra configuration', async () => {
  await compose();
  expect(await screen.findByText('AAP user')).toBeInTheDocument();
  expect(screen.getByText('GitHub')).toBeInTheDocument();
  expect(screen.getByText('GitLab')).toBeInTheDocument();
  expect(
    aapRow().getByRole('button', { name: 'Sign out' }),
  ).toBeInTheDocument();
});

it('signs in to the AAP provider without replacing host authentication', async () => {
  const { auth, identity } = await compose({ state: SessionState.SignedOut });
  await screen.findByText('Ansible Automation Platform');
  fireEvent.click(aapRow().getByRole('button', { name: 'Sign in' }));
  expect(auth.signIn).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('AAP user')).toBeInTheDocument();
  expect(identity.signOut).not.toHaveBeenCalled();
});

it('updates the AAP row after disconnecting without signing out the host identity', async () => {
  const { auth, identity } = await compose();
  await screen.findByText('AAP user');
  fireEvent.click(aapRow().getByRole('button', { name: 'Sign out' }));
  await waitFor(() =>
    expect(
      aapRow().getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument(),
  );
  expect(auth.signOut).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('AAP user')).not.toBeInTheDocument();
  expect(identity.signOut).not.toHaveBeenCalled();
});

it('disconnects only the AAP provider session and reports failures', async () => {
  const { auth, identity, errors } = await compose();
  await screen.findByText('AAP user');
  const failure = new Error('AAP disconnect failed');
  auth.signOut.mockRejectedValueOnce(failure);
  fireEvent.click(aapRow().getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(errors.post).toHaveBeenCalledWith(failure));
  expect(identity.signOut).not.toHaveBeenCalled();
});

it('keeps other providers visible and explains a missing AAP API', async () => {
  await renderTestApp({
    features: [userSettingsPlugin, createAapSettingsModule()],
    config: { auth: { providers: { github: {} } } },
    apis: [[githubAuthApiRef, provider(SessionState.SignedIn, 'GitHub user')]],
    initialRouteEntries: ['/settings/auth-providers'],
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'AAP authentication API is unavailable',
  );
  expect(screen.getByText('GitHub')).toBeInTheDocument();
});

it('allows a host to retain its existing custom provider rows', async () => {
  await renderTestApp({
    features: [
      userSettingsPlugin,
      createAapSettingsModule({
        providerSettings: <li>Existing enterprise provider</li>,
      }),
    ],
    apis: [[rhAapAuthApiRef, provider(SessionState.SignedIn, 'AAP user')]],
    initialRouteEntries: ['/settings/auth-providers'],
  });
  expect(await screen.findByText('AAP user')).toBeInTheDocument();
  expect(screen.getByText('Existing enterprise provider')).toBeInTheDocument();
});
