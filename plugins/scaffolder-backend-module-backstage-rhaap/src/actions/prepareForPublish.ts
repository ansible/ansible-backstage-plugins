import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { Config } from '@backstage/config';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';
import { randomBytes } from 'node:crypto';

interface CheckRepositoryExistsInput {
  sourceControlProvider: string;
  repositoryOwner: string;
  repositoryName: string;
  createNewRepository: boolean;
  eeFileName: string;
  contextDirName: string;
  token?: string;
}

function buildScmUrls(
  scmProvider: 'github' | 'gitlab',
  host: string,
  owner: string,
  repo: string,
  contextDir: string,
): { catalogInfoUrl: string; fullRepoUrl: string } {
  const blobSegment = scmProvider === 'gitlab' ? '/-/blob' : '/blob';
  return {
    catalogInfoUrl: `https://${host}/${owner}/${repo}${blobSegment}/main/${contextDir}/catalog-info.yaml`,
    fullRepoUrl: `https://${host}/${owner}/${repo}${blobSegment}/main/${contextDir}/`,
  };
}

export function prepareForPublishAction(options: { rootConfig: Config }) {
  const { rootConfig } = options;

  return createTemplateAction({
    id: 'ansible:prepare:publish',
    description: 'Check if a repository exists',
    schema: {
      input: {
        sourceControlProvider: z =>
          z.string({ description: 'SCM provider (e.g. GitHub, GitLab)' }),
        repositoryOwner: z => z.string(),
        repositoryName: z => z.string(),
        eeFileName: z => z.string(),
        createNewRepository: z => z.boolean().optional(),
        contextDirName: z => z.string(),
        token: z =>
          z
            .string()
            .optional()
            .describe(
              'Optional OAuth token for SCM authentication. If not provided, the integration token from app-config will be used.',
            ),
      },
      output: {
        createNewRepo: z => z.boolean().optional(),
        generatedRepoUrl: z => z.string().optional(),
        normalizedRepoUrl: z => z.string().optional(),
        generatedTitle: z => z.string().optional(),
        generatedDescription: z => z.string().optional(),
        generatedBranchName: z => z.string().optional(),
        generatedCatalogInfoUrl: z => z.string().optional(),
        generatedFullRepoUrl: z => z.string().optional(),
        gitlabProjectId: z => z.number().optional(),
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
      const values = input as unknown as CheckRepositoryExistsInput;
      const sourceControlProvider = values.sourceControlProvider;
      const repositoryOwner = values.repositoryOwner;
      const repositoryName = values.repositoryName;
      const createNewRepository = values.createNewRepository;
      const eeFileName = values.eeFileName;
      const contextDirName = values.contextDirName;
      const token = values.token;
      let createNewRepo = false;

      try {
        const scmClientFactory = new ScmClientFactory({
          rootConfig,
          logger,
        });

        const scmProvider = sourceControlProvider.toLowerCase() as
          | 'github'
          | 'gitlab';
        const scmClient = await scmClientFactory.createClient({
          scmProvider,
          organization: repositoryOwner,
          token,
        });

        const exists = await scmClient.repositoryExists(
          repositoryOwner,
          repositoryName,
        );

        logger.info(
          `${sourceControlProvider} Repository ${repositoryOwner}/${repositoryName} exists: ${exists}`,
        );

        if (!exists) {
          if (!createNewRepository) {
            throw new Error(
              `${sourceControlProvider} Repository ${repositoryOwner}/${repositoryName} does not exist and creating a new repository was not enabled.`,
            );
          }
          logger.info(
            `A new ${sourceControlProvider} repository ${repositoryOwner}/${repositoryName} will be created.`,
          );
          createNewRepo = true;
        }

        ctx.output('createNewRepo', createNewRepo);

        if (scmProvider === 'gitlab' && !createNewRepo) {
          const numericProjectId = await scmClient.getProjectId(
            repositoryOwner,
            repositoryName,
          );
          if (numericProjectId === undefined) {
            logger.warn(
              `Could not resolve GitLab numeric project ID for ${repositoryOwner}/${repositoryName}`,
            );
          } else {
            logger.info(
              `Resolved GitLab numeric project ID: ${numericProjectId} for ${repositoryOwner}/${repositoryName}`,
            );
            ctx.output('gitlabProjectId', numericProjectId);
          }
        }

        const host = scmClient.getHost();
        const generatedRepoUrl = `${host}?repo=${repositoryName}&owner=${repositoryOwner}`;
        logger.info(`Generated repository URL: ${generatedRepoUrl}`);
        ctx.output('generatedRepoUrl', generatedRepoUrl);

        const normalizedRepoUrl = `${host}/${repositoryOwner}/${repositoryName}`;
        logger.info(`Normalized repository URL: ${normalizedRepoUrl}`);
        ctx.output('normalizedRepoUrl', normalizedRepoUrl);

        if (!createNewRepo) {
          const branchName = `${eeFileName.toLowerCase()}-${randomBytes(2).toString('hex')}`;
          const prType =
            scmProvider === 'gitlab' ? 'Merge Request' : 'Pull Request';

          ctx.output(
            'generatedTitle',
            `[AAP] Adds/updates files for Execution Environment ${eeFileName}`,
          );
          ctx.output(
            'generatedDescription',
            `This ${prType} adds Execution Environment files generated from Ansible Portal.`,
          );
          ctx.output('generatedBranchName', branchName);
        }

        const { catalogInfoUrl, fullRepoUrl } = buildScmUrls(
          scmProvider,
          host,
          repositoryOwner,
          repositoryName,
          contextDirName,
        );
        logger.info(`Generated repository contents URL: ${catalogInfoUrl}`);
        ctx.output('generatedCatalogInfoUrl', catalogInfoUrl);
        if (createNewRepo) {
          ctx.output('generatedFullRepoUrl', fullRepoUrl);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        throw new Error(message);
      }
    },
  });
}
