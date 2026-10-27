import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { SyncDialog } from './SyncDialog';

describe('SDK SyncDialog', () => {
  const providers = [
    {
      sourceId: 'one',
      scmProvider: 'github',
      hostName: 'github.test',
      organization: 'one',
      lastSyncTime: null,
    },
    {
      sourceId: 'two',
      scmProvider: 'github',
      hostName: 'github.test',
      organization: 'two',
      lastSyncTime: null,
    },
    {
      sourceId: 'other',
      scmProvider: 'github',
      hostName: 'enterprise.test',
      organization: 'other',
      lastSyncTime: null,
    },
    {
      sourceId: 'gitlab',
      scmProvider: 'gitlab',
      hostName: 'gitlab.test',
      lastSyncTime: null,
    },
    { sourceId: 'pah', repository: 'published', lastSyncTime: null },
    {
      sourceId: 'custom',
      scmProvider: 'custom',
      hostName: 'custom.test',
      lastSyncTime: null,
    },
  ];
  const onClose = jest.fn();
  const onSyncsStarted = jest.fn();
  const showNotification = jest.fn();
  const discovery = { getBaseUrl: jest.fn().mockResolvedValue('/catalog') };
  const post = jest.fn();
  const get = jest.fn();
  const fetchApi = {
    fetch: jest.fn((url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? post(url, init) : get(url),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers } }),
    });
    post.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ status: 'started' }] }),
    });
  });

  const mount = (open = true) =>
    render(
      <TestApiProvider
        apis={[
          [discoveryApiRef, discovery],
          [fetchApiRef, fetchApi],
        ]}
      >
        <SyncDialog
          open={open}
          onClose={onClose}
          onSyncsStarted={onSyncsStarted}
          showNotification={showNotification}
        />
      </TestApiProvider>,
    );
  const checkbox = (label: string) =>
    within(
      screen.getByText(label).closest('[role="button"]') as HTMLElement,
    ).getByRole('checkbox');
  const loaded = async () => {
    await screen.findByText('GitHub', {}, { timeout: 10000 });
  };
  const submit = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Sync Selected' }));

  it('does not load sources while closed', () => {
    mount(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('shows available providers and disables submission without a selection', async () => {
    mount();
    await loaded();
    expect(screen.getByText('Private Automation Hub')).toBeInTheDocument();
    expect(screen.getByText('GitLab')).toBeInTheDocument();
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync Selected' }),
    ).toBeDisabled();
  });

  it.each(['empty', 'failed'] as const)(
    'handles a %s source response',
    async mode => {
      get.mockResolvedValue(
        mode === 'empty' ? { ok: true, json: async () => ({}) } : { ok: false },
      );
      mount();
      expect(
        await screen.findByText(/No sources configured/),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select All' })).toBeDisabled();
    },
  );

  it('selects and deselects all sources and allows cancellation', async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(screen.getByRole('button', { name: 'Sync Selected' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    expect(
      screen.getByRole('button', { name: 'Sync Selected' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('groups a whole-provider selection into one filter and tracks all its providers', async () => {
    mount();
    await loaded();
    fireEvent.click(checkbox('GitHub'));
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      '/catalog/ansible/sync/from-scm/content',
      expect.objectContaining({
        body: JSON.stringify({ filters: [{ scmProvider: 'github' }] }),
      }),
    );
    expect(onSyncsStarted).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'one' }),
        expect.objectContaining({ sourceId: 'other' }),
      ]),
    );
  });

  it('uses a host filter for a selected host', async () => {
    mount();
    await loaded();
    fireEvent.click(checkbox('github.test'));
    submit();
    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 10000 });
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({
      filters: [{ scmProvider: 'github', hostName: 'github.test' }],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), {
      timeout: 10000,
    });
  }, 20000);

  it('uses an organization filter for a selected leaf', async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByText('one'));
    submit();
    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 10000 });
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({
      filters: [
        {
          scmProvider: 'github',
          hostName: 'github.test',
          organization: 'one',
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), {
      timeout: 10000,
    });
  }, 20000);

  it('routes PAH repositories to the AAP sync endpoint', async () => {
    mount();
    await loaded();
    fireEvent.click(checkbox('published'));
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      '/catalog/ansible/sync/from-aap/content',
      expect.objectContaining({
        body: JSON.stringify({ filters: [{ repository_name: 'published' }] }),
      }),
    );
  });

  it('handles leaf hosts and collapsible provider/host navigation', async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByText('github.test'));
    await waitFor(() =>
      expect(screen.queryByText('one')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('github.test'));
    await screen.findByText('one');
    fireEvent.click(screen.getByText('GitHub'));
    await waitFor(() =>
      expect(screen.queryByText('github.test')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('GitHub'));
    await screen.findByText('github.test');
    fireEvent.click(checkbox('gitlab.test'));
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({
      filters: [
        {
          scmProvider: 'gitlab',
          hostName: 'gitlab.test',
          organization: 'gitlab.test',
        },
      ],
    });
  });

  it.each([
    {
      ok: false,
      body: { error: 'Permission denied' },
      message: 'Permission denied',
    },
    {
      ok: false,
      body: { error: { message: 'Backend unavailable' } },
      message: 'Backend unavailable',
    },
    { ok: false, body: { message: 'Bad request' }, message: 'Bad request' },
    {
      ok: true,
      body: {
        results: [
          {
            status: 'failed',
            repositoryName: 'published',
            error: { message: 'Unavailable' },
          },
        ],
      },
      message: 'PAH:published: Unavailable',
    },
    {
      ok: true,
      body: {
        results: [
          {
            status: 'invalid',
            scmProvider: 'github',
            hostName: 'github.test',
            organization: 'one',
          },
        ],
      },
      message: 'github:github.test:one: invalid',
    },
  ])(
    'reports a rejected sync outcome: $message',
    async ({ ok, body, message }) => {
      post.mockResolvedValue({ ok, status: 400, json: async () => body });
      mount();
      await loaded();
      fireEvent.click(checkbox('GitHub'));
      submit();
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Sync failed',
            severity: 'error',
            description: expect.stringContaining(message),
          }),
        ),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(onSyncsStarted).not.toHaveBeenCalled();
    },
  );

  it('tracks successful requests when another selected source fails', async () => {
    post.mockImplementation(async (url: string) => ({
      ok: url.includes('from-scm'),
      statusText: 'PAH unavailable',
      json: async () => ({}),
    }));
    mount();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    submit();
    await waitFor(() => expect(onSyncsStarted).toHaveBeenCalled());
    expect(onSyncsStarted.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: 'pah' })]),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
