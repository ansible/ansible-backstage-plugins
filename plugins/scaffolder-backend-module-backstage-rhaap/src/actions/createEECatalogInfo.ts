import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthService } from '@backstage/backend-plugin-api';
import { DiscoveryService } from '@backstage/backend-plugin-api';
import { randomBytes } from 'crypto';

interface CreateEECatalogInfoInput {
  componentName: string;
  description: string;
  tags: string[];
  owner: string;
  repoUrl: string;
  publishToSCM: boolean;
  contextDirName: string;
  eeDefinitionContent: string;
  readmeContent: string;
}

function generateCatalogInfoContent(
  componentName: string,
  description: string,
  tags: string[],
  owner: string,
  repoUrl: string,
): string {
  let normalizedRepoUrl = repoUrl;
  try {
    const [hostPart, queryPart] = repoUrl.split('?');
    const params = new URLSearchParams(queryPart);
    const repo = params.get('repo');
    const repoOwner = params.get('owner');

    if (repo && repoOwner) {
      normalizedRepoUrl = `${hostPart}/${repoOwner}/${repo}`;
    }
  } catch (e) {
    normalizedRepoUrl = '';
  }

  return `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${componentName}
  description: ${description}
  tags:
${tags.map(tag => `    - ${tag}`).join('\n')}
  annotations:
    backstage.io/techdocs-ref: dir:.
    backstage.io/managed-by-location: ${normalizedRepoUrl}
spec:
  type: execution-environment
  owner: ${owner}
  lifecycle: production
`;
}

function generateDynamicCatalogEntity(
  componentName: string,
  description: string,
  tags: string[],
  owner: string,
  eeDefinitionContent: string,
  readmeContent: string,
) {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: `${componentName.toLowerCase()}-${randomBytes(2).toString('hex')}`,
      title: componentName,
      description: description,
      tags: tags,
      annotations: {
        'backstage.io/managed-by-location': `url:127.0.0.1`,
        'backstage.io/managed-by-origin-location': `url:127.0.0.1`,
        'ansible.io/download-experience': 'true',
      },
    },
    spec: {
      type: 'execution-environment',
      lifecycle: 'production',
      owner: owner,
      name: componentName,
      definition: eeDefinitionContent,
      readme: readmeContent,
    },
  };
}

export function createEECatalogInfoAction(options: {
  auth: AuthService;
  discovery: DiscoveryService;
}) {
  const { auth, discovery } = options;
  return createTemplateAction({
    id: 'ansible:ee:create-catalog-info',
    description: 'Generate catalog-info for the EE Definition',
    schema: {
      input: {
        type: 'object',
        required: ['componentName', 'description', 'tags'],
        properties: {
          componentName: {
            title: 'Name of the catalog component',
            type: 'string',
          },
          description: {
            title: 'Description of the catalog component',
            type: 'string',
          },
          tags: {
            title: 'Tags for the catalog component',
            type: 'array',
            items: { type: 'string' },
          },
          repoUrl: {
            title: 'Repository URL of the catalog component',
            type: 'string',
          },
          publishToSCM: {
            title: 'Publish to a SCM repository or not',
            type: 'boolean',
            default: true,
          },
          contextDirName: {
            title: 'Directory in the workspace where the files will created',
            type: 'string',
          },
          eeDefinitionContent: {
            title: 'Contents of the EE definition file',
            type: 'string',
          },
          readmeContent: {
            title: 'Contents of the EE readme file',
            type: 'string',
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          catalogInfoContent: {
            title: 'Contents of the generated catalog-info file',
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger, workspacePath } = ctx;
      const values = input as unknown as CreateEECatalogInfoInput;
      const componentName = values.componentName;
      const description = values.description;
      const tags = values.tags;
      const owner = ctx.user?.ref || '';
      const repoUrl = values.repoUrl;
      const publishToSCM = values.publishToSCM;
      const contextDirName = values.contextDirName;
      const eeDefinitionContent = values.eeDefinitionContent;
      const readmeContent = values.readmeContent;

      try {
        if (publishToSCM) {
          const catalogInfoContent = generateCatalogInfoContent(
            componentName,
            description,
            tags,
            owner,
            repoUrl,
          );
          // This directory should already exist from previous steps, but just in case
          const eeDir = path.join(workspacePath, contextDirName);
          await fs.mkdir(eeDir, { recursive: true });

          const catalogInfoPath = path.join(eeDir, 'catalog-info.yaml');
          await fs.writeFile(catalogInfoPath, catalogInfoContent);
          logger.info(`Created catalog-info.yaml at ${catalogInfoPath}`);
          ctx.output('catalogInfoContent', catalogInfoContent);
        } else {
          // User has chosen to not publish to a SCM repository, so we need to register the EE as a dynamic catalog entity
          const entity = generateDynamicCatalogEntity(
            componentName,
            description,
            tags,
            owner,
            eeDefinitionContent,
            readmeContent,
          );
          logger.info(
            `Generated dynamic catalog entity: ${JSON.stringify(entity)}`,
          );
          // Register the entity with the catalog
          const baseUrl = await discovery.getBaseUrl('catalog');
          logger.info(`Base URL: ${baseUrl}`);

          const { token } = await auth.getPluginRequestToken({
            onBehalfOf: await auth.getOwnServiceCredentials(),
            targetPluginId: 'catalog',
          });

          const response = await fetch(`${baseUrl}/aap/register_ee`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entity }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to register EE definition: ${errorText}`);
          }
        }
      } catch (error: any) {
        throw new Error(`${error.message}`);
      }
    },
  });
}
