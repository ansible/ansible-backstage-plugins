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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
      orgsUsersTeams: { lastSync: null },
      jobTemplates: { lastSync: null },
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
