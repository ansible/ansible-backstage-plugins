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
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => ({
    isSuperuser: true,
    loading: false,
    error: null,
  }),
}));

import { HomeComponent } from './Home';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef, rhAapAuthApiRef } from '../../apis';
import { mockCatalogApi } from '../../tests/catalogApi_utils';
import { mockAnsibleApi, mockRhAapAuthApi } from '../../tests/mockAnsibleApi';
import { mockScaffolderApi } from '../../tests/scaffolderApi_utils';

describe('self-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('mock-token');
    mockAnsibleApi.getSyncStatus.mockResolvedValue({
      aap: {
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    // Restore autocomplete if it was deleted
    if (!mockScaffolderApi.autocomplete) {
      mockScaffolderApi.autocomplete = jest.fn().mockResolvedValue({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      }) as jest.MockedFunction<any>;
    } else {
      (
        mockScaffolderApi.autocomplete as jest.MockedFunction<any>
      ).mockResolvedValue({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      });
    }
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [ansibleApiRef, mockAnsibleApi],
          [rhAapAuthApiRef, mockRhAapAuthApi],
          [scaffolderApiRef, mockScaffolderApi],
          [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          [permissionApiRef, mockApis.permission()],
        ]}
      >
        <MockEntityListContextProvider>
          {children}
        </MockEntityListContextProvider>
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/self-service': rootRouteRef,
        },
      },
    );
  };
  const facetsFromEntityRefs = (entityRefs: string[], tags: string[]) => ({
    facets: {
      'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
      'metadata.tags': tags.map((value, idx) => ({ value, count: idx })),
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
    // load wizard card
    expect(screen.getByText('service')).toBeInTheDocument();
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync now');
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync now');
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync now');
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync now');
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    // Simulate clicking sync button
    const syncButton = screen.getByText('Sync now');
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

  it('should handle case when scaffolderApi.autocomplete does not exist', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );

    // Remove autocomplete from scaffolderApi
    delete (mockScaffolderApi as any).autocomplete;

    await render(<HomeComponent />);

    expect(screen.getByText('Templates', { exact: true })).toBeInTheDocument();
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
        orgsUsersTeams: { lastSync: null },
        jobTemplates: { lastSync: null },
      },
    });

    await render(<HomeComponent />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync now');
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

  it('should handle snackbar closing', async () => {
    const entityRefs = ['component:default/e1'];
    const tags = ['tag1'];
    mockCatalogApi.getEntityFacets.mockResolvedValue(
      facetsFromEntityRefs(entityRefs, tags),
    );

    await render(<HomeComponent />);

    // Test snackbar functionality exists
    expect(screen.getByText('Templates', { exact: true })).toBeInTheDocument();
  });

  describe('fetchJobTemplates and sync refresh', () => {
    // Helper: opens sync dialog, selects Job Templates checkbox, clicks Ok
    const triggerTemplateSync = async () => {
      fireEvent.click(screen.getByText('Sync now'));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toBeInTheDocument(),
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getAllByRole('checkbox')[1]);
      fireEvent.click(screen.getByText('Ok'));
    };

    it('should fetch job templates via autocomplete on mount', async () => {
      const entityRefs = ['component:default/e1'];
      const tags = ['tag1'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tags),
      );

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(mockRhAapAuthApi.getAccessToken).toHaveBeenCalled();
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledWith({
          token: 'mock-token',
          resource: 'job_templates',
          provider: 'aap-api-cloud',
          context: {},
        });
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
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      (mockScaffolderApi.autocomplete as jest.Mock).mockClear();

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        // Unchanged AAP list after sync triggers a delayed second autocomplete fetch.
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(2);
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
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      (mockScaffolderApi.autocomplete as jest.Mock).mockClear();

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
      });

      // Failed sync should not trigger fetchJobTemplates.
      // The CATALOG_SETTLE_MS auto-refresh may independently trigger at most one call.
      expect(
        (mockScaffolderApi.autocomplete as jest.Mock).mock.calls.length,
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
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      };

      (mockScaffolderApi.autocomplete as jest.Mock)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValueOnce(sameResults)
        .mockResolvedValue(sameResults);

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      await triggerTemplateSync();

      await waitFor(
        () => {
          expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
          // Mount + post-sync fetch + stale-list retry
          expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(3);
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
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: IDs 1, 2, 3 — new template added
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
          { id: '3', title: 'New Template' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(2);
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
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
          { id: '3', title: 'Template 3' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: IDs 1, 2 — template 3 removed
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(2);
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
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Template 2' },
        ],
      });

      await render(<HomeComponent />);

      await waitFor(() => {
        expect(screen.getByText('Sync now')).toBeInTheDocument();
      });

      const facetCallsBeforeSync =
        mockCatalogApi.getEntityFacets.mock.calls.length;

      // After sync: same IDs but template 2 was renamed
      (mockScaffolderApi.autocomplete as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: '1', title: 'Template 1' },
          { id: '2', title: 'Renamed Template' },
        ],
      });

      await triggerTemplateSync();

      await waitFor(() => {
        expect(mockAnsibleApi.syncTemplates).toHaveBeenCalled();
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(2);
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
});
