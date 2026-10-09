import { useState, type ReactNode } from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import {
  catalogApiRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { HomeComponent } from './Home';
import { JobTemplatesProvider } from './JobTemplatesProvider';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef } from '../../apis';
import { mockCatalogApi } from '../../tests/catalogApi_utils';
import { mockAnsibleApi } from '../../tests/mockAnsibleApi';

const mockShowNotification = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockNavigate,
}));

const mockSyncSignal: {
  lastSignal: {
    provider: string;
    syncInProgress: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: string | null;
    lastFailedSyncTime: string | null;
    lastDuplicateEntityCount?: number;
    lastMissingOrganizations?: string[];
  } | null;
} = { lastSignal: null };

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => ({ isSuperuser: true, loading: false, error: null }),
}));

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: () => ({ loading: false, allowed: true }),
}));

jest.mock('@backstage/plugin-signals-react', () => ({
  useSignal: () => mockSyncSignal,
}));

jest.mock('../notifications', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  NotificationStack: () => null,
  useNotifications: () => ({
    notifications: [],
    removeNotification: jest.fn(),
    showNotification: mockShowNotification,
    clearAll: jest.fn(),
  }),
}));

/** Parent re-render without remounting Home (keeps refs). */
const RerenderProbe = ({ children }: { children: ReactNode }) => {
  const [, setTick] = useState(0);
  return (
    <>
      <button
        type="button"
        data-testid="rerender-probe"
        onClick={() => setTick(t => t + 1)}
      >
        bump
      </button>
      {children}
    </>
  );
};

describe('Home coverage gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncSignal.lastSignal = null;
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });
    mockAnsibleApi.getUserJobTemplates.mockResolvedValue({
      items: [
        { id: 1, name: 'Template 1' },
        { id: 2, name: 'Template 2' },
      ],
    });
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': [],
        'metadata.tags': [{ value: 'tag1', count: 1 }],
        'spec.type': [{ value: 'service', count: 1 }],
      },
    });
    mockCatalogApi.queryEntities.mockResolvedValue({
      items: [],
      totalItems: 0,
      pageInfo: {},
    });
  });

  const renderHome = (ansibleApi: typeof mockAnsibleApi = mockAnsibleApi) =>
    renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, ansibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <RerenderProbe>
            <JobTemplatesProvider>
              <HomeComponent />
            </JobTemplatesProvider>
          </RerenderProbe>
        </MockEntityListContextProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/self-service': rootRouteRef } },
    );

  it('skips duplicate sync-outcome notifications for the same signal key', async () => {
    const outcome = {
      provider: 'aap-entity:development',
      syncInProgress: false,
      lastSyncTime: '2026-01-01T00:00:00Z',
      lastSyncStatus: 'success' as const,
      lastFailedSyncTime: null,
      lastDuplicateEntityCount: 1,
      lastMissingOrganizations: [] as string[],
    };
    mockSyncSignal.lastSignal = outcome;

    await renderHome();

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Sync warning' }),
      );
    });
    const callsAfterFirst = mockShowNotification.mock.calls.length;

    // New object, identical outcome key — effect must early-return.
    mockSyncSignal.lastSignal = { ...outcome };
    fireEvent.click(screen.getByTestId('rerender-probe'));

    await waitFor(() => {
      expect(screen.getByTestId('rerender-probe')).toBeInTheDocument();
    });
    expect(mockShowNotification.mock.calls.length).toBe(callsAfterFirst);
  });

  it('does not re-invalidate when JT ids are unchanged after a reload', async () => {
    const { rerender } = await renderHome();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    // New ansibleApi identity recreates refreshJobTemplates → non-background
    // reload (loading → ready) with the same JT id set (same-key early return).
    const reloadedApi = {
      ...mockAnsibleApi,
      getUserJobTemplates: jest.fn().mockResolvedValue({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
        ],
      }),
      getSyncStatus: mockAnsibleApi.getSyncStatus,
      syncTemplates: mockAnsibleApi.syncTemplates,
      syncOrgsUsersTeam: mockAnsibleApi.syncOrgsUsersTeam,
    };

    rerender(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, reloadedApi as typeof mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <RerenderProbe>
            <JobTemplatesProvider>
              <HomeComponent />
            </JobTemplatesProvider>
          </RerenderProbe>
        </MockEntityListContextProvider>
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(reloadedApi.getUserJobTemplates).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });
  });

  it('retries job template load from the error state', async () => {
    (mockAnsibleApi.getUserJobTemplates as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        items: [{ id: 1, name: 'Template 1' }],
      });

    await renderHome();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });
  });

  it('shows the fallback error copy when errorMessage is empty', async () => {
    (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockRejectedValueOnce('');

    await renderHome();

    await waitFor(() => {
      expect(
        screen.getByText(
          'Could not load your AAP job templates. Try signing in again or use Retry below.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('navigates to catalog-import when Add Template is clicked', async () => {
    await renderHome();

    await waitFor(() => {
      expect(screen.getByTestId('add-template-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-template-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('self-service/catalog-import'),
      );
    });
  });
});
