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

        if (!exists && !createNewRepository) {
          throw new Error(
            `${sourceControlProvider} Repository ${repositoryOwner}/${repositoryName} does not exist and creating a new repository was not enabled.`,
          );
        }

        if (!exists && createNewRepository) {
          logger.info(
            `A new ${sourceControlProvider} repository ${repositoryOwner}/${repositoryName} will be created.`,
          );
          createNewRepo = true;
        }

        ctx.output('createNewRepo', createNewRepo);

        const host = scmClient.getHost();
        const generatedRepoUrl = `${host}?repo=${repositoryName}&owner=${repositoryOwner}`;
        logger.info(`Generated repository URL: ${generatedRepoUrl}`);
        ctx.output('generatedRepoUrl', generatedRepoUrl);

        const normalizedRepoUrl = `${host}/${repositoryOwner}/${repositoryName}`;
        logger.info(`Normalized repository URL: ${normalizedRepoUrl}`);
        ctx.output('normalizedRepoUrl', normalizedRepoUrl);

        // TO-DO: make the default branch name configurable
        const branchName = createNewRepo
          ? 'main'
          : `${eeFileName.toLowerCase()}-${randomBytes(2).toString('hex')}`;

        if (!createNewRepo) {
          const title = `[AAP] Adds/updates files for Execution Environment ${eeFileName}`;
          const description = `This ${
            scmProvider === 'gitlab' ? 'Merge Request' : 'Pull Request'
          } adds Execution Environment files generated from Ansible Portal.`;

          ctx.output('generatedTitle', title);
          ctx.output('generatedDescription', description);
          ctx.output('generatedBranchName', branchName);
        }

        let catalogInfoUrl = '';
        let fullRepoUrl = '';
        if (scmProvider === 'github') {
          catalogInfoUrl = `https://${host}/${repositoryOwner}/${repositoryName}/blob/main/${contextDirName}/catalog-info.yaml`;
          fullRepoUrl = `https://${host}/${repositoryOwner}/${repositoryName}/blob/main/${contextDirName}/`;
        } else if (scmProvider === 'gitlab') {
          catalogInfoUrl = `https://${host}/${repositoryOwner}/${repositoryName}/-/blob/main/${contextDirName}/catalog-info.yaml`;
          fullRepoUrl = `https://${host}/${repositoryOwner}/${repositoryName}/-/blob/main/${contextDirName}/`;
        } else {
          throw new Error(
            `Unsupported SCM provider '${scmProvider}' for repository ${repositoryOwner}/${repositoryName}/${contextDirName}`,
          );
        }
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
