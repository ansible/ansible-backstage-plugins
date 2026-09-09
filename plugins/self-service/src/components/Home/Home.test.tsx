import { screen, fireEvent, waitFor, within } from '@testing-library/react';
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
import { HomeComponent, TemplatesRoutesPage } from './Home';
import { JobTemplatesProvider } from './JobTemplatesProvider';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef } from '../../apis';
import { mockCatalogApi } from '../../tests/catalogApi_utils';
import { mockAnsibleApi } from '../../tests/mockAnsibleApi';

const mockUseIsSuperuser = jest.fn(() => ({
  isSuperuser: true,
  loading: false,
  error: null,
}));

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => mockUseIsSuperuser(),
}));

const mockUsePermission = jest.fn(() => ({
  loading: false,
  allowed: true,
}));

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: (...args: unknown[]) =>
    mockUsePermission(...(args as Parameters<typeof mockUsePermission>)),
}));

const mockRemoveNotification = jest.fn();
const mockNotifications = [
  {
    id: 'n1',
    title: 'Test notification',
    severity: 'success' as const,
    timestamp: new Date(),
  },
];

const mockSyncSignal: {
  lastSignal: {
    provider: string;
    syncInProgress: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: string | null;
    lastFailedSyncTime: string | null;
  } | null;
} = { lastSignal: null };
jest.mock('@backstage/plugin-signals-react', () => ({
  useSignal: () => mockSyncSignal,
}));

jest.mock('../notifications', () => ({
  NotificationProvider: ({ children }: any) => <>{children}</>,
  NotificationStack: ({
    notifications,
    onClose,
  }: {
    notifications: Array<{ id: string; title: string }>;
    onClose: (id: string) => void;
  }) => (
    <div data-testid="notification-stack">
      {notifications.map((n: any) => (
        <div key={n.id} data-testid={`notification-${n.id}`}>
          {n.title}
          <button onClick={() => onClose(n.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  ),
  useNotifications: () => ({
    notifications: mockNotifications,
    removeNotification: mockRemoveNotification,
    showNotification: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

describe('self-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
    mockUsePermission.mockReturnValue({
      loading: false,
      allowed: true,
    });

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

    // Mock queryEntities for server-side pagination (EntityListProvider uses
    // queryEntities instead of getEntities when pagination is enabled)
    mockCatalogApi.queryEntities.mockImplementation(async (request: any) => {
      const { items } = await mockCatalogApi.getEntities();
      const queryLimit = request?.limit ?? items.length;
      const queryOffset = request?.offset ?? 0;
      const sliced = items.slice(queryOffset, queryOffset + queryLimit);
      return {
        items: sliced,
        totalItems: items.length,
        pageInfo: {
          ...(queryOffset + queryLimit < items.length
            ? { nextCursor: `next:${queryOffset + queryLimit}` }
            : {}),
          ...(queryOffset > 0
            ? { prevCursor: `prev:${Math.max(0, queryOffset - queryLimit)}` }
            : {}),
        },
      };
    });
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <JobTemplatesProvider>{children}</JobTemplatesProvider>
        </MockEntityListContextProvider>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };
  const facetsFromEntityRefs = (
    entityRefs: string[],
    tags: string[],
    types: string[] = ['service'],
  ) => ({
    facets: {
      'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
      'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
      'spec.type': types.map(value => ({ value, count: 1 })),
    },
  });

  it('should render', async () => {
    const entityRefs = ['component:default/e1', 'component:default/e2'];
    const tags = ['tag1', 'tag2', 'tag3', 'tag4'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    await render(<HomeComponent />);
    expect(screen.getByText('Templates', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Add Template')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    // load wizard card (wait for facets + queryEntities to settle)
    await waitFor(() => {
      expect(screen.getByText('service')).toBeInTheDocument();
    });
    expect(screen.getByText('Create wizard use cases')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use this template to create actual wizard use case templates',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('RedHat')).toBeInTheDocument();
    expect(screen.getByText('aap-operations')).toBeInTheDocument();
    expect(screen.getByText('intermediate')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('should open sync dialog when sync button is clicked', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('AAP synchronization options')).toBeInTheDocument();
    expect(
      screen.getByText('Organizations, Users, and Teams'),
    ).toBeInTheDocument();
    expect(screen.getByText('Job Templates')).toBeInTheDocument();
  });

  it('should handle sync operations successfully', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.syncOrgsUsersTeam.mockResolvedValue(true);
    mockAnsibleApi.syncTemplates.mockResolvedValue(true);
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select both options - find checkboxes within the dialog by role
    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    const orgsCheckbox = checkboxes[0]; // First checkbox is for Organizations, Users, and Teams
    const templatesCheckbox = checkboxes[1]; // Second checkbox is for Job Templates
    fireEvent.click(orgsCheckbox);
    fireEvent.click(templatesCheckbox);

    // Click OK to trigger sync
    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    // Wait for sync operations to complete
    await waitFor(() => {
      expect(mockAnsibleApi.syncOrgsUsersTeam).toHaveBeenCalled();
      expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
    });
  });

  it('should handle sync operations with failures', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.syncOrgsUsersTeam.mockResolvedValue(false);
    mockAnsibleApi.syncTemplates.mockResolvedValue(false);
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select both options - find checkboxes within the dialog by role
    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    const orgsCheckbox = checkboxes[0]; // First checkbox is for Organizations, Users, and Teams
    const templatesCheckbox = checkboxes[1]; // Second checkbox is for Job Templates
    fireEvent.click(orgsCheckbox);
    fireEvent.click(templatesCheckbox);

    // Click OK to trigger sync
    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    // Wait for sync operations to complete
    await waitFor(() => {
      expect(mockAnsibleApi.syncOrgsUsersTeam).toHaveBeenCalled();
      expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
    });
  });

  it('should handle organizations sync only', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.syncOrgsUsersTeam.mockResolvedValue(true);
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select only organizations option - find checkbox within the dialog by role
    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    const orgsCheckbox = checkboxes[0]; // First checkbox is for Organizations, Users, and Teams
    fireEvent.click(orgsCheckbox);

    // Click OK to trigger sync
    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    // Wait for sync operations to complete
    await waitFor(() => {
      expect(mockAnsibleApi.syncOrgsUsersTeam).toHaveBeenCalled();
      expect(mockAnsibleApi.syncTemplates).not.toHaveBeenCalled();
    });
  });

  it('should handle sync dialog cancel', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    // Wait for dialog to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click Cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Verify no sync operations were called
    expect(mockAnsibleApi.syncOrgsUsersTeam).not.toHaveBeenCalled();
    expect(mockAnsibleApi.syncTemplates).not.toHaveBeenCalled();
  });

  it('should handle templates only sync', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.syncTemplates.mockResolvedValue(true);
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    const templatesCheckbox = checkboxes[1]; // Second checkbox is for Job Templates
    fireEvent.click(templatesCheckbox);

    const okButton = screen.getByText('Ok');
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
      expect(mockAnsibleApi.syncOrgsUsersTeam).not.toHaveBeenCalled();
    });
  });

  describe('fetchJobTemplates and sync refresh', () => {
    // Helper: opens sync dialog, selects Job Templates checkbox, clicks Ok
    const triggerTemplateSync = async () => {
      fireEvent.click(screen.getByText('Sync Now'));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toBeInTheDocument(),
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getAllByRole('checkbox')[1]);
      fireEvent.click(screen.getByText('Ok'));
    };

    it('should fetch job templates on mount', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalled();
      });
    });

    it('should re-fetch job templates after successful template sync', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(true);

      await render(<HomeComponent />);

      // Wait for at least one mount autocomplete call before clearing.
      // Use toHaveBeenCalled() rather than an exact count because the
      // CATALOG_SETTLE_MS auto-refresh timer may trigger an extra call.
      await waitFor(() => {
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalled();
      });

      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockClear();

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        // Unchanged AAP list after sync triggers a delayed second autocomplete fetch.
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
      });
    });

    it('should not re-fetch job templates when template sync fails', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(false);

      await render(<HomeComponent />);

      // Wait for at least one mount autocomplete call before clearing.
      await waitFor(() => {
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalled();
      });

      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockClear();

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
      });

      // Failed sync should not trigger fetchJobTemplates.
      // The CATALOG_SETTLE_MS auto-refresh may independently trigger at most one call.
      expect(
        (mockAnsibleApi.getUserJobTemplates as jest.Mock).mock.calls.length,
      ).toBeLessThanOrEqual(1);
    });

    it('should remount EntityListProvider after template sync even when the AAP list is unchanged', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(true);

      const sameResults = {
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
        ],
      };

      (mockAnsibleApi.getUserJobTemplates as jest.Mock)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValue(sameResults);

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      await triggerTemplateSync();

      await waitFor(
        () => {
          expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
          // Mount + post-sync fetch + stale-list retry
          expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(3);
        },
        { timeout: 4000 },
      );

      await waitFor(() => {
        expect(
          mockCatalogApi.getEntityFacets.mock.calls.length,
        ).toBeGreaterThan(facetCallsBeforeSync);
      });
    });

    it('should remount when a new template is added after sync', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(true);

      // Mount: IDs 1, 2
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: IDs 1, 2, 3 — new template added
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
          { id: 3, name: 'New Template' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
      });

      // EntityListProvider should have remounted — getEntityFacets called again
      await waitFor(() => {
        expect(
          mockCatalogApi.getEntityFacets.mock.calls.length,
        ).toBeGreaterThan(facetCallsBeforeSync);
      });
    });

    it('should remount when a template is removed after sync', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(true);

      // Mount: IDs 1, 2, 3
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
          { id: 3, name: 'Template 3' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: IDs 1, 2 — template 3 removed
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
      });

      // EntityListProvider should have remounted — getEntityFacets called again
      await waitFor(() => {
        expect(
          mockCatalogApi.getEntityFacets.mock.calls.length,
        ).toBeGreaterThan(facetCallsBeforeSync);
      });
    });

    it('should remount when a template is renamed after sync', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );
      mockAnsibleApi.syncTemplates.mockResolvedValue(true);

      // Mount: IDs 1, 2 with original names
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: 2, name: 'Template 2' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: same IDs but template 2 was renamed
      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Template 1' },
          { id: '2', title: 'Renamed Template' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
      });

      // EntityListProvider should have remounted — getEntityFacets called again
      await waitFor(() => {
        expect(
          mockCatalogApi.getEntityFacets.mock.calls.length,
        ).toBeGreaterThan(facetCallsBeforeSync);
      });
    });
  });

  describe('HomeTagPicker', () => {
    it('should render Tags filter', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1', 'tag2'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Tags')).toBeInTheDocument();
      });
    });

    it('should render TagFilterPicker with correct placeholder', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1', 'tag2'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        const tagsInputs = screen.getAllByPlaceholderText('Tags');
        expect(tagsInputs.length).toBeGreaterThan(0);
      });
    });
  });

  describe('permission gating', () => {
    it('should show Sync Now disabled while superuser check is loading', async () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: false,
        loading: true,
        error: null,
      });

      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    it('should hide Sync now when user is not a superuser', async () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: false,
        loading: false,
        error: null,
      });

      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      expect(screen.queryByText('Sync Now')).toBeNull();
    });

    it('should show Add Template when user is superuser and has catalog create permission', async () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: true,
        loading: false,
        error: null,
      });
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: true,
      });

      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      expect(screen.getByTestId('add-template-button')).toBeInTheDocument();
      expect(screen.getByTestId('add-template-button')).not.toBeDisabled();
    });

    it.each([
      ['user has create permission but is not superuser', false, true],
      ['user is superuser but lacks catalog create permission', true, false],
      ['user lacks both superuser and catalog create permission', false, false],
    ])(
      'should hide Add Template when %s',
      async (_desc, isSuperuser, allowed) => {
        mockUseIsSuperuser.mockReturnValue({
          isSuperuser,
          loading: false,
          error: null,
        });
        mockUsePermission.mockReturnValue({ loading: false, allowed });

        const entityRefs = ['component:default/e1'];
        const tags = ['tag1'];
        mockCatalogApi.getEntityFacets.mockResolvedValue(
          facetsFromEntityRefs(entityRefs, tags),
        );

        await render(<HomeComponent />);

        expect(screen.queryByTestId('add-template-button')).toBeNull();
      },
    );

    it('should show Add Template disabled while permission check is loading', async () => {
      mockUseIsSuperuser.mockReturnValue({
        isSuperuser: true,
        loading: false,
        error: null,
      });
      mockUsePermission.mockReturnValue({
        loading: true,
        allowed: false,
      });

      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      const addButton = screen.getByTestId('add-template-button');
      expect(addButton).toBeDisabled();
    });
  });

  describe('HomeCategoryPicker', () => {
    it('should render Categories filter', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Categories')).toBeInTheDocument();
      });
    });

    it('should render categories picker container', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('categories-picker')).toBeInTheDocument();
      });
    });

    it('should render TagFilterPicker with Categories placeholder', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        const categoriesInput = screen.getByPlaceholderText('Categories');
        expect(categoriesInput).toBeInTheDocument();
      });
    });
  });

  describe('job template fetch errors', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const expectJobTemplateFetchError = async (message: string) => {
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Retry' }),
        ).toBeInTheDocument();
        expect(screen.getAllByText(message).length).toBeGreaterThanOrEqual(1);
      });
    };

    it('should show inline and snackbar errors when getUserJobTemplates fails', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockRejectedValue(
        new Error('Controller service is absent in provided AAP instance'),
      );

      await render(<HomeComponent />);

      await expectJobTemplateFetchError(
        'Controller service is absent in provided AAP instance',
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it.each([
      [
        'Error.message',
        new Error('Network connection failed'),
        'Network connection failed',
      ],
      ['plain string rejection', 'plain string error', 'plain string error'],
    ])(
      'should surface job template fetch failures from %s',
      async (_description, rejection, expectedMessage) => {
        const entityRefs = ['component:default/e1'];
        const tags = ['tag1'];
        mockCatalogApi.getEntityFacets.mockResolvedValue(
          facetsFromEntityRefs(entityRefs, tags),
        );

        (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockRejectedValue(
          rejection,
        );

        await render(<HomeComponent />);

        await expectJobTemplateFetchError(expectedMessage);
      },
    );

    it('should dismiss the snackbar alert but keep the inline error', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      (mockAnsibleApi.getUserJobTemplates as jest.Mock).mockRejectedValue(
        new Error('Controller service is absent in provided AAP instance'),
      );

      await render(<HomeComponent />);

      await expectJobTemplateFetchError(
        'Controller service is absent in provided AAP instance',
      );

      const alert = screen.getByRole('alert');
      fireEvent.click(within(alert).getByRole('button'));

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(
        screen.getAllByText(
          'Controller service is absent in provided AAP instance',
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('should filter out execution-environment type entities from templates', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags, [
        'service',
        'execution-environment',
      ]),
    );
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'regular-template',
            title: 'Regular Template',
            description: 'A regular template',
            namespace: 'default',
            tags: [],
            uid: 'uid-1',
            etag: 'etag-1',
            annotations: {},
          },
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          spec: { owner: 'RedHat', type: 'service' },
          relations: [],
        },
        {
          metadata: {
            name: 'ee-template',
            title: 'EE Builder',
            description: 'Build EE',
            namespace: 'default',
            tags: [],
            uid: 'uid-2',
            etag: 'etag-2',
            annotations: {},
          },
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          spec: { owner: 'RedHat', type: 'execution-environment' },
          relations: [],
        },
      ],
    });
    mockCatalogApi.queryEntities.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'regular-template',
            title: 'Regular Template',
            description: 'A regular template',
            namespace: 'default',
            tags: [],
            uid: 'uid-1',
            etag: 'etag-1',
            annotations: {},
          },
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          spec: { owner: 'RedHat', type: 'service' },
          relations: [],
        },
        {
          metadata: {
            name: 'ee-template',
            title: 'EE Builder',
            description: 'Build EE',
            namespace: 'default',
            tags: [],
            uid: 'uid-2',
            etag: 'etag-2',
            annotations: {},
          },
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          spec: { owner: 'RedHat', type: 'execution-environment' },
          relations: [],
        },
      ],
      totalItems: 2,
      pageInfo: {},
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Regular Template')).toBeInTheDocument();
    });
    expect(screen.queryByText('EE Builder')).not.toBeInTheDocument();
  });

  it('should filter out entities whose aapJobTemplateId does not match any job template', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );

    const templateWithMatchingId = {
      metadata: {
        name: 'matching-template',
        title: 'Matching Template',
        description: 'Has matching ID',
        namespace: 'default',
        tags: [],
        uid: 'uid-match',
        etag: 'etag-1',
        annotations: {},
        aapJobTemplateId: 1,
      },
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      spec: { owner: 'RedHat', type: 'service' },
      relations: [],
    };
    const templateWithNonMatchingId = {
      metadata: {
        name: 'orphan-template',
        title: 'Orphan Template',
        description: 'Has non-matching ID',
        namespace: 'default',
        tags: [],
        uid: 'uid-orphan',
        etag: 'etag-2',
        annotations: {},
        aapJobTemplateId: 999,
      },
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      spec: { owner: 'RedHat', type: 'service' },
      relations: [],
    };
    const templateWithNoId = {
      metadata: {
        name: 'no-id-template',
        title: 'No ID Template',
        description: 'No aapJobTemplateId',
        namespace: 'default',
        tags: [],
        uid: 'uid-noid',
        etag: 'etag-3',
        annotations: {},
      },
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      spec: { owner: 'RedHat', type: 'service' },
      relations: [],
    };

    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        templateWithMatchingId,
        templateWithNonMatchingId,
        templateWithNoId,
      ],
    });
    mockCatalogApi.queryEntities.mockResolvedValue({
      items: [templateWithMatchingId, templateWithNoId],
      totalItems: 2,
      pageInfo: {},
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Matching Template')).toBeInTheDocument();
    });
    expect(screen.getByText('No ID Template')).toBeInTheDocument();
    expect(screen.queryByText('Orphan Template')).not.toBeInTheDocument();
  });

  it('should show "No templates found" when catalog returns no entities', async () => {
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': [],
        'metadata.tags': [],
        'spec.type': [],
      },
    });
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    mockCatalogApi.queryEntities.mockResolvedValue({
      items: [],
      totalItems: 0,
      pageInfo: {},
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-templates')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('No templates found.')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByText(/Page/)).toBeNull();
  });

  it('should show sync button disabled when sync is in progress', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: true },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now').closest('button');
    expect(syncButton).toBeDisabled();
  });

  it('should show sync button disabled while checking permissions', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: false,
      loading: true,
      error: null,
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now').closest('button');
    expect(syncButton).toBeDisabled();
  });

  it('should display last sync time from job templates', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    const syncTime = '2026-08-01T12:00:00Z';
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: syncTime, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now').closest('button');
    expect(syncButton).not.toBeDisabled();
  });

  it('should select the most recent sync timestamp', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );
    const olderSync = '2026-08-01T10:00:00Z';
    const newerSync = '2026-08-01T14:00:00Z';
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: newerSync, syncInProgress: false },
        jobTemplates: { lastSync: olderSync, syncInProgress: false },
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Now').closest('button');
    expect(syncButton).not.toBeDisabled();
  });
});

describe('TemplatesRoutesPage notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
  });

  const renderPage = () => {
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': [{ count: 1, value: 'component:default/e1' }],
        'metadata.tags': [{ value: 'tag1', count: 0 }],
      },
    });

    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <TemplatesRoutesPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('renders NotificationStack with notifications', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('notification-stack')).toBeInTheDocument();
    });
    expect(screen.getByTestId('notification-n1')).toBeInTheDocument();
    expect(screen.getByText('Test notification')).toBeInTheDocument();
  });

  it('calls removeNotification when dismiss is clicked', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('notification-stack')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));
    expect(mockRemoveNotification).toHaveBeenCalledWith('n1');
  });
});

describe('sync signal integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

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
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <JobTemplatesProvider>{children}</JobTemplatesProvider>
        </MockEntityListContextProvider>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('should update sync status when a completed signal arrives', async () => {
    mockSyncSignal.lastSignal = {
      provider: 'aap-org-users-teams',
      syncInProgress: false,
      lastSyncTime: '2025-06-01T12:00:00.000Z',
      lastSyncStatus: 'success',
      lastFailedSyncTime: null,
    };

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    mockSyncSignal.lastSignal = null;
  });

  it('should route job template signals to jobTemplates key', async () => {
    mockSyncSignal.lastSignal = {
      provider: 'aap-job-template-provider',
      syncInProgress: false,
      lastSyncTime: '2025-06-01T13:00:00.000Z',
      lastSyncStatus: 'success',
      lastFailedSyncTime: null,
    };

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    mockSyncSignal.lastSignal = null;
  });

  it('should keep sync disabled when one provider completes but another is still syncing', async () => {
    mockSyncSignal.lastSignal = {
      provider: 'aap-org-users-teams',
      syncInProgress: true,
      lastSyncTime: null,
      lastSyncStatus: null,
      lastFailedSyncTime: null,
    };

    await render(<HomeComponent />);

    await waitFor(() => {
      const syncButton = screen.getByText('Sync Now').closest('button');
      expect(syncButton).toBeDisabled();
    });

    mockSyncSignal.lastSignal = {
      provider: 'aap-job-template-provider',
      syncInProgress: false,
      lastSyncTime: '2025-06-01T13:00:00.000Z',
      lastSyncStatus: 'success',
      lastFailedSyncTime: null,
    };

    await waitFor(() => {
      const syncButton = screen.getByText('Sync Now').closest('button');
      expect(syncButton).toBeDisabled();
    });

    mockSyncSignal.lastSignal = null;
  });
});

describe('sync progress tooltip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

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
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <JobTemplatesProvider>{children}</JobTemplatesProvider>
        </MockEntityListContextProvider>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  const triggerSync = async (options: ('orgsUsersTeams' | 'templates')[]) => {
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    if (options.includes('orgsUsersTeams')) fireEvent.click(checkboxes[0]);
    if (options.includes('templates')) fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByText('Ok'));
  };

  it('should show sync progress popover with template-specific entries during sync', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
        'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
        'spec.type': [{ value: 'service', count: 1 }],
      },
    });
    mockAnsibleApi.syncOrgsUsersTeam.mockReturnValue(new Promise(() => {}));
    mockAnsibleApi.syncTemplates.mockReturnValue(new Promise(() => {}));

    await render(<HomeComponent />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    await triggerSync(['orgsUsersTeams', 'templates']);

    await waitFor(() => {
      expect(mockAnsibleApi.syncOrgsUsersTeam).toHaveBeenCalled();
    });

    fireEvent.mouseOver(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('Syncing…')).toBeInTheDocument();
      expect(
        screen.getByText('Organizations, Users, and Teams'),
      ).toBeInTheDocument();
      expect(screen.getByText('Job Templates')).toBeInTheDocument();
    });
  });

  it('should show only selected sync types in tooltip', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
        'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
        'spec.type': [{ value: 'service', count: 1 }],
      },
    });
    mockAnsibleApi.syncTemplates.mockReturnValue(new Promise(() => {}));

    await render(<HomeComponent />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    await triggerSync(['templates']);

    await waitFor(() => {
      expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
    });

    fireEvent.mouseOver(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('Syncing…')).toBeInTheDocument();
      expect(screen.getByText('Job Templates')).toBeInTheDocument();
      expect(
        screen.queryByText('Organizations, Users, and Teams'),
      ).not.toBeInTheDocument();
    });
  });

  it('should not show popover when no sync has been triggered', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
        'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
        'spec.type': [{ value: 'service', count: 1 }],
      },
    });

    await render(<HomeComponent />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.mouseOver(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.queryByText('Syncing…')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Last sync completed with errors'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Sync completed')).not.toBeInTheDocument();
    });
  });

  it('should show failure state when sync signal reports failure', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
        'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
        'spec.type': [{ value: 'service', count: 1 }],
      },
    });
    mockAnsibleApi.syncOrgsUsersTeam.mockResolvedValue(true);
    mockAnsibleApi.syncTemplates.mockResolvedValue(false);

    mockSyncSignal.lastSignal = {
      provider: 'aap-job-template-provider',
      syncInProgress: false,
      lastSyncTime: null,
      lastSyncStatus: 'failure',
      lastFailedSyncTime: '2026-01-01T00:00:00Z',
    };

    await render(<HomeComponent />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    await triggerSync(['orgsUsersTeams', 'templates']);

    await waitFor(() => {
      expect(mockAnsibleApi.syncOrgsUsersTeam).toHaveBeenCalled();
    });

    fireEvent.mouseOver(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(
        screen.getByText('Last sync completed with errors'),
      ).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    mockSyncSignal.lastSignal = null;
  });
});

describe('HomeCategoryPicker EE exclusion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
    mockUsePermission.mockReturnValue({ loading: false, allowed: true });

    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null, syncInProgress: false },
        jobTemplates: { lastSync: null, syncInProgress: false },
      },
    });
    mockAnsibleApi.getUserJobTemplates.mockResolvedValue({
      items: [{ id: 1, name: 'Template 1' }],
    });
    mockCatalogApi.queryEntities.mockImplementation(async (request: any) => {
      const { items } = await mockCatalogApi.getEntities();
      const queryLimit = request?.limit ?? items.length;
      const queryOffset = request?.offset ?? 0;
      const sliced = items.slice(queryOffset, queryOffset + queryLimit);
      return {
        items: sliced,
        totalItems: items.length,
        pageInfo: {},
      };
    });
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          <JobTemplatesProvider>{children}</JobTemplatesProvider>
        </MockEntityListContextProvider>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };

  it('should exclude execution-environment types from category facets', async () => {
    mockCatalogApi.getEntityFacets.mockResolvedValue({
      facets: {
        'spec.type': [
          { value: 'service', count: 10 },
          { value: 'execution-environment', count: 5 },
          { value: 'workflow', count: 3 },
        ],
        'metadata.tags': [{ value: 'tag1', count: 1 }],
        'relations.ownedBy': [],
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(mockCatalogApi.getEntityFacets).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { kind: 'Template' },
          facets: ['spec.type'],
        }),
      );
    });

    // HomeCatalogProvider sends a predicate query, not a legacy filter object.
    await waitFor(() => {
      const calls = mockCatalogApi.queryEntities.mock.calls;
      const hasNonEETypeQuery = calls.some((call: any[]) => {
        const branches = call[0]?.query?.$all;
        if (!Array.isArray(branches)) {
          return false;
        }

        return branches.some((branch: Record<string, unknown>) => {
          const typeFilter = branch['spec.type'] as
            { $in?: string[] } | undefined;
          return (
            Array.isArray(typeFilter?.$in) &&
            typeFilter.$in.includes('service') &&
            typeFilter.$in.includes('workflow') &&
            !typeFilter.$in.includes('execution-environment')
          );
        });
      });
      expect(hasNonEETypeQuery).toBe(true);
    });
  });

  it('should handle getEntityFacets failure gracefully', async () => {
    mockCatalogApi.getEntityFacets.mockRejectedValue(
      new Error('Network error'),
    );

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });
});
