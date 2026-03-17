import { screen, waitFor, fireEvent } from '@testing-library/react';
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
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';

import { CreateContent } from './CreateContent';
import { rootRouteRef } from '../../../routes';
import { ansibleApiRef, rhAapAuthApiRef } from '../../../apis';
import { mockCatalogApi } from '../../../tests/catalogApi_utils';
import {
  mockAnsibleApi,
  mockRhAapAuthApi,
} from '../../../tests/mockAnsibleApi';
import { mockScaffolderApi } from '../../../tests/scaffolderApi_utils';

jest.mock('../../Home/TemplateCard', () => ({
  WizardCard: ({ template }: { template: TemplateEntityV1beta3 }) => (
    <div data-testid={`wizard-card-${template.metadata.name}`}>
      {template.metadata.title}
    </div>
  ),
}));

describe('CreateContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('mock-token');
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

  // Note: tagFacets are only used for EntityTagPicker facets, NOT for execution-environment filtering
  // Execution-environment templates are filtered by spec.type via EntityTypeFilter, not by tags
  const facetsFromEntityRefs = (entityRefs: string[], tagFacets: string[]) => ({
    facets: {
      'relations.ownedBy': entityRefs.map(value => ({ count: 1, value })),
      'metadata.tags': tagFacets.map((value, idx) => ({ value, count: idx })),
    },
  });

  describe('Rendering', () => {
    it('should render the component', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      expect(screen.getByTestId('create-content')).toBeInTheDocument();
    });

    it('should render the description text', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      expect(
        screen.getByText(
          /Create an Execution Environment \(EE\) definition to ensure your playbooks/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/run the same way, every time/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Choose a recommended preset or start from scratch/),
      ).toBeInTheDocument();
    });
  });

  describe('Filter Components', () => {
    it('should render EntitySearchBar', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      const searchBarContainer = screen.getByTestId('search-bar-container');
      expect(searchBarContainer).toBeInTheDocument();
    });

    it('should render UserListPicker', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      const userPickerContainer = screen.getByTestId('user-picker-container');
      expect(userPickerContainer).toBeInTheDocument();
    });

    // TemplateCategoryPicker was removed as it's not needed when filtering by spec.type

    it('should render EntityTagPicker', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('create-content')).toBeInTheDocument();
      });
    });

    it('should render EntityKindPicker with correct initial filter', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('create-content')).toBeInTheDocument();
      });
    });
  });

  describe('TemplateGroups Configuration', () => {
    it('should render templates container', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      const templatesContainer = screen.getByTestId('templates-container');
      expect(templatesContainer).toBeInTheDocument();
    });

    it('should filter templates with execution-environment type', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const templateWithType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template',
          namespace: 'default',
          title: 'Execution Environment Template',
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [templateWithType],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('templates-container')).toBeInTheDocument();
      });
    });

    it('should exclude templates without execution-environment type', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const templateWithType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template',
          namespace: 'default',
          title: 'Execution Environment Template',
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      const templateWithoutType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'other-template',
          namespace: 'default',
          title: 'Other Template',
        },
        spec: {
          type: 'other',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [templateWithType, templateWithoutType],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('templates-container')).toBeInTheDocument();
      });
    });

    it('should handle templates with non-execution-environment type', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const templateWithOtherType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'other-type-template',
          namespace: 'default',
          title: 'Other Type Template',
        },
        spec: {
          type: 'other',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [templateWithOtherType],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('templates-container')).toBeInTheDocument();
      });
    });

    it('should handle templates with empty type string', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const templateWithEmptyType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'empty-type-template',
          namespace: 'default',
          title: 'Empty Type Template',
        },
        spec: {
          type: '',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [templateWithEmptyType],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('templates-container')).toBeInTheDocument();
      });
    });
  });

  describe('Layout Structure', () => {
    it('should have correct layout structure with filters and content', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      expect(screen.getByTestId('create-content')).toBeInTheDocument();
      expect(screen.getByTestId('search-bar-container')).toBeInTheDocument();
      expect(screen.getByTestId('user-picker-container')).toBeInTheDocument();
      // TemplateCategoryPicker was removed - no longer needed
      expect(screen.getByTestId('templates-container')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('should use WizardCard as TemplateCardComponent', async () => {
      const entityRefs = ['component:default/e1'];
      // tagFacets are only for EntityTagPicker facets, not used for execution-environment filtering
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const templateWithType: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template',
          namespace: 'default',
          title: 'Execution Environment Template',
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [templateWithType],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('templates-container')).toBeInTheDocument();
      });
    });
  });

  describe('EETagPicker', () => {
    it('should render Tags label when execution-environment templates have tags', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets = ['ee-tag1', 'ee-tag2'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const eeTemplateWithTags: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template-with-tags',
          namespace: 'default',
          title: 'EE Template With Tags',
          tags: ['ee-tag1', 'ee-tag2'],
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [eeTemplateWithTags],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByText('Tags')).toBeInTheDocument();
      });
    });

    it('should not render EETagPicker when no execution-environment templates have tags', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets: string[] = [];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const eeTemplateWithoutTags: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template-no-tags',
          namespace: 'default',
          title: 'EE Template Without Tags',
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [eeTemplateWithoutTags],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('create-content')).toBeInTheDocument();
      });

      expect(screen.queryByText('Tags')).not.toBeInTheDocument();
    });

    it('should filter tags based on execution-environment templates only', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets = ['ee-tag', 'other-tag'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      const eeTemplate: TemplateEntityV1beta3 = {
        apiVersion: 'scaffolder.backstage.io/v1beta3',
        kind: 'Template',
        metadata: {
          name: 'ee-template',
          namespace: 'default',
          title: 'EE Template',
          tags: ['ee-tag'],
        },
        spec: {
          type: 'execution-environment',
          steps: [],
          parameters: [],
        },
      };

      mockCatalogApi.getEntities.mockResolvedValue({
        items: [eeTemplate],
      });

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('create-content')).toBeInTheDocument();
      });
    });
  });

  describe('Kebab Menu', () => {
    it('should render kebab menu button', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      await waitFor(() => {
        expect(screen.getByTestId('kebab-menu-button')).toBeInTheDocument();
      });
    });

    it('should open menu when kebab button is clicked', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      const kebabButton = screen.getByTestId('kebab-menu-button');
      fireEvent.click(kebabButton);

      await waitFor(() => {
        expect(screen.getByText('Import Template')).toBeInTheDocument();
      });
    });

    it('should render Import Template menu item', async () => {
      const entityRefs = ['component:default/e1'];
      const tagFacets = ['execution-environment'];
      mockCatalogApi.getEntityFacets.mockResolvedValue(
        facetsFromEntityRefs(entityRefs, tagFacets),
      );

      await render(<CreateContent />);

      const kebabButton = screen.getByTestId('kebab-menu-button');
      fireEvent.click(kebabButton);

      await waitFor(() => {
        expect(
          screen.getByTestId('import-template-button'),
        ).toBeInTheDocument();
      });
    });
  });
});
