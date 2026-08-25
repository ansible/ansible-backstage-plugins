import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { AuthService, DiscoveryService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';

interface RegisterGitRepositoryInput {
  sourceControlProvider: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  owner?: string;
  description?: string;
  token?: string;
}

const SUPPORTED_SCM_PROVIDERS = ['github', 'gitlab'] as const;
type SupportedScmProvider = (typeof SUPPORTED_SCM_PROVIDERS)[number];

function isSupportedScmProvider(value: string): value is SupportedScmProvider {
  return (SUPPORTED_SCM_PROVIDERS as readonly string[]).includes(value);
}

function assertRepositoryUrlMatchesIdentity(
  repositoryUrl: string,
  provider: SupportedScmProvider,
  owner: string,
  repo: string,
): void {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error(
      '[ansible:register:git-repository] repositoryUrl must be a valid HTTPS URL.',
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      '[ansible:register:git-repository] repositoryUrl must use https.',
    );
  }

  if (provider === 'github' && url.hostname.toLowerCase() !== 'github.com') {
    throw new Error(
      '[ansible:register:git-repository] GitHub repositoryUrl must be hosted on github.com.',
    );
  }

  const path = url.pathname.replace(/\.git$/i, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      '[ansible:register:git-repository] repositoryUrl must include owner and repository.',
    );
  }

  const urlRepo = parts[parts.length - 1];
  const urlOwner = parts.slice(0, -1).join('/');
  if (
    urlOwner.toLowerCase() !== owner.toLowerCase() ||
    urlRepo.toLowerCase() !== repo.toLowerCase()
  ) {
    throw new Error(
      `[ansible:register:git-repository] repositoryUrl does not match ${owner}/${repo}.`,
    );
  }
}

/**
 * Builds a Backstage catalog entity object for a Git repository registered
 * directly by a user (e.g. via the "Register repo" scaffolder template).
 *
 * The returned entity mirrors the shape produced for crawler-discovered
 * repositories (see `repositoryParser` in `catalog-backend-module-rhaap`) so
 * that existing Git Repos UI features (host resolution, CI activity, optional
 * detail tabs) work without changes. Unlike crawler-discovered entities, no
 * `ansible.io/discovery-source-id` is set since this repository was not
 * found by a scheduled sync; instead `ansible.io/registration-method` marks
 * it as manually registered.
 *
 * @param sourceControlProvider - Lowercased SCM provider (`'github'` or `'gitlab'`).
 * @param repositoryOwner - Organization or user that owns the repository.
 * @param repositoryName - Repository name.
 * @param repositoryUrl - Fully-qualified URL to the repository.
 * @param defaultBranch - Default branch of the repository.
 * @param owner - Backstage owner entity ref (e.g. `group:default/my-team`).
 * @param description - Optional human-readable description.
 * @returns A plain object conforming to the Backstage Component entity schema.
 */
function generateGitRepositoryCatalogEntity(
  sourceControlProvider: string,
  repositoryOwner: string,
  repositoryName: string,
  repositoryUrl: string,
  defaultBranch: string,
  owner: string,
  description?: string,
) {
  const fullPath = `${repositoryOwner}/${repositoryName}`;
  const entityName = sanitizeEntityName(
    `${fullPath}-${sourceControlProvider}-manual`,
  );

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      namespace: 'default',
      title: repositoryName,
      description: description || `Git repository: ${fullPath}`,
      tags: ['git-repository', sourceControlProvider, 'manually-registered'],
      links: [
        {
          url: repositoryUrl,
          title: 'Repository',
          icon: sourceControlProvider === 'gitlab' ? 'gitlab' : 'github',
        },
      ],
      annotations: {
        'backstage.io/source-location': `url:${repositoryUrl}`,
        'backstage.io/view-url': repositoryUrl,
        'backstage.io/managed-by-location': `url:${repositoryUrl}`,
        'backstage.io/managed-by-origin-location': `url:${repositoryUrl}`,
        'ansible.io/scm-provider': sourceControlProvider,
        'ansible.io/scm-organization': repositoryOwner,
        'ansible.io/scm-repository': repositoryName,
        'ansible.io/registration-method': 'manual',
      },
    },
    spec: {
      type: 'git-repository',
      lifecycle: 'production',
      owner,
      system: `${repositoryOwner}-repositories`,
      repository_name: repositoryName,
      repository_default_branch: defaultBranch,
      repository_collection_count: 0,
      repository_ee_count: 0,
    },
  };
}

function sanitizeEntityName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '')
    .substring(0, 63);
}

export function registerGitRepositoryAction(options: {
  auth: AuthService;
  discovery: DiscoveryService;
  rootConfig: Config;
}) {
  const { auth, discovery, rootConfig } = options;

  return createTemplateAction({
    id: 'ansible:register:git-repository',
    description:
      'Registers an existing Git repository directly in the Ansible Portal catalog, without requiring a catalog-info.yaml file or pull request in the target repository',
    schema: {
      input: {
        sourceControlProvider: z =>
          z.enum(['github', 'gitlab'], {
            description: 'SCM provider (github or gitlab)',
          }),
        repositoryOwner: z => z.string(),
        repositoryName: z => z.string(),
        repositoryUrl: z =>
          z.string({ description: 'Fully-qualified URL to the repository' }),
        defaultBranch: z => z.string(),
        owner: z =>
          z
            .string()
            .optional()
            .describe(
              'Backstage owner entity ref (e.g. group:default/my-team). Defaults to the user running the template.',
            ),
        description: z => z.string().optional(),
        token: z =>
          z
            .string()
            .optional()
            .describe(
              'Optional OAuth token for SCM authentication. If not provided, the integration token from app-config will be used.',
            ),
      },
      output: {
        entityRef: z => z.string().optional(),
        entityName: z => z.string().optional(),
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
      const values = input as unknown as RegisterGitRepositoryInput;
      const sourceControlProvider = values.sourceControlProvider.toLowerCase();
      if (!isSupportedScmProvider(sourceControlProvider)) {
        throw new Error(
          `[ansible:register:git-repository] Unsupported source control provider "${values.sourceControlProvider}". ` +
            `Supported values: ${SUPPORTED_SCM_PROVIDERS.join(', ')}.`,
        );
      }
      assertRepositoryUrlMatchesIdentity(
        values.repositoryUrl,
        sourceControlProvider,
        values.repositoryOwner,
        values.repositoryName,
      );
      const owner = values.owner || ctx.user?.ref;
      if (!owner) {
        throw new Error(
          '[ansible:register:git-repository] owner is required (pass owner or run the template as an authenticated user).',
        );
      }

      const scmClientFactory = new ScmClientFactory({ rootConfig, logger });
      const scmClient = await scmClientFactory.createClient({
        scmProvider: sourceControlProvider,
        organization: values.repositoryOwner,
        token: values.token,
      });

      const exists = await scmClient.repositoryExists(
        values.repositoryOwner,
        values.repositoryName,
      );

      if (!exists) {
        throw new Error(
          `[ansible:register:git-repository] Repository ${values.repositoryOwner}/${values.repositoryName} ` +
            `does not exist or is not accessible via ${sourceControlProvider}. ` +
            `Registration requires an existing, accessible repository.`,
        );
      }

      const entity = generateGitRepositoryCatalogEntity(
        sourceControlProvider,
        values.repositoryOwner,
        values.repositoryName,
        values.repositoryUrl,
        values.defaultBranch,
        owner,
        values.description,
      );

      const baseUrl = await discovery.getBaseUrl('catalog');
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: await auth.getOwnServiceCredentials(),
        targetPluginId: 'catalog',
      });

      const response = await fetch(`${baseUrl}/ansible/git-repository`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entity }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 409) {
          logger.warn(
            `[ansible:register:git-repository] Repository already registered: ${errorText}`,
          );
        }
        throw new Error(`Failed to register Git repository: ${errorText}`);
      }

      const result = (await response.json()) as { entityRef?: string };
      if (result.entityRef) {
        ctx.output('entityRef', result.entityRef);
      }
      ctx.output('entityName', entity.metadata.name);

      logger.info(
        `[ansible:register:git-repository] Successfully registered ${values.repositoryOwner}/${values.repositoryName} in the catalog`,
      );
    },
  });
}
