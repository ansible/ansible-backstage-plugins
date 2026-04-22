import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { AnsibleConfig } from '@ansible/backstage-rhaap-common';
import { UseCaseMaker } from './helpers';
import { randomBytes } from 'crypto';

interface CheckRepositoryExistsInput {
  sourceControlProvider: string;
  repositoryOwner: string;
  repositoryName: string;
  createNewRepository: boolean;
  eeFileName: string;
  contextDirName: string;
}

export function prepareForPublishAction(options: {
  ansibleConfig: AnsibleConfig;
}) {
  const { ansibleConfig } = options;
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
      let createNewRepo = false;

      try {
        const useCaseMaker = new UseCaseMaker({
          ansibleConfig: ansibleConfig,
          logger,
          scmType: sourceControlProvider,
          apiClient: null,
          useCases: [],
          organization: null,
          token: null,
        });

        const exists = await useCaseMaker.checkIfRepositoryExists({
          repoOwner: repositoryOwner,
          repoName: repositoryName,
        });

        logger.info(
          `${sourceControlProvider} Repository ${repositoryOwner}/${repositoryName} exists: ${exists}`,
        );

        if (exists) {
          createNewRepo = false;
        } else if (!exists && createNewRepository) {
          logger.info(
            `A new ${sourceControlProvider} repository ${repositoryOwner}/${repositoryName} will be created.`,
          );
          createNewRepo = true;
        } else {
          throw new Error(
            `${sourceControlProvider} Repository ${repositoryOwner}/${repositoryName} does not exist and creating a new repository was not enabled.`,
          );
        }

        ctx.output('createNewRepo', createNewRepo);

        // Generate the repository URL from SCM integration settings for further publish steps
        // Required in both cases - repo exists or not
        const generatedRepoUrl = await useCaseMaker.generateRepositoryUrl({
          repoOwner: repositoryOwner,
          repoName: repositoryName,
        });
        logger.info(`Generated repository URL: ${generatedRepoUrl}`);
        ctx.output('generatedRepoUrl', generatedRepoUrl);

        // create a normalized repository URL (required for catalog component registration)
        let normalizedRepoUrl;
        try {
          const [hostPart, queryPart] = generatedRepoUrl.split('?');
          const params = new URLSearchParams(queryPart);
          const repo = params.get('repo');
          const repoOwner = params.get('owner');

          if (repo && repoOwner) {
            normalizedRepoUrl = `${hostPart}/${repoOwner}/${repo}`;
          }
        } catch (e) {
          normalizedRepoUrl = '';
        }
        logger.info(`Normalized repository URL: ${normalizedRepoUrl}`);
        ctx.output('normalizedRepoUrl', normalizedRepoUrl);

        // TO-DO: make the default branch name configurable
        let branchName = 'main';

        // If a new repository does not have to be created
        // and we have reached this far it means that a PR/MR needs to be created
        if (!createNewRepo) {
          const title = `[AAP] Adds/updates files for Execution Environment ${eeFileName}`;
          const description = `This ${
            sourceControlProvider === 'Gitlab'
              ? 'Merge Request'
              : 'Pull Request'
          } adds Execution Environment files generated from Ansible Portal.`;
          branchName = `${eeFileName.toLowerCase()}-${randomBytes(2).toString('hex')}`;

          ctx.output('generatedTitle', title);
          ctx.output('generatedDescription', description);
          ctx.output('generatedBranchName', branchName);
        }

        // Required for catalog component registration
        const [hostPart, _] = generatedRepoUrl.split('?');
        let catalogInfoUrl = '';
        let fullRepoUrl = '';
        // The URL structure is different for Github and Gitlab
        if (sourceControlProvider === 'Github') {
          catalogInfoUrl = `https://${hostPart}/${repositoryOwner}/${repositoryName}/blob/main/${contextDirName}/catalog-info.yaml`;
          fullRepoUrl = `https://${hostPart}/${repositoryOwner}/${repositoryName}/blob/main/${contextDirName}/`;
        } else if (sourceControlProvider === 'Gitlab') {
          catalogInfoUrl = `https://${hostPart}/${repositoryOwner}/${repositoryName}/-/blob/main/${contextDirName}/catalog-info.yaml`;
          fullRepoUrl = `https://${hostPart}/${repositoryOwner}/${repositoryName}/-/blob/main/${contextDirName}/`;
        }
        logger.info(`Generated repository contents URL: ${catalogInfoUrl}`);
        ctx.output('generatedCatalogInfoUrl', catalogInfoUrl);
        if (createNewRepo) {
          ctx.output('generatedFullRepoUrl', fullRepoUrl);
        }
      } catch (error: any) {
        throw new Error(`${error.message}`);
      }
    },
  });
}
