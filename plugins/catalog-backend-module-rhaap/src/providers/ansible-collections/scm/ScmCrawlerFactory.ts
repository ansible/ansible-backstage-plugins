import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';

import type { ScmCrawler } from './ScmCrawler';
import type { AnsibleGitContentsSourceConfig } from '../types';
import { GithubCrawler } from './GithubCrawler';
import { GitlabCrawler } from './GitlabCrawler';

export class ScmCrawlerFactory {
  private readonly scmClientFactory: ScmClientFactory;
  private readonly logger: LoggerService;

  constructor(options: { rootConfig: Config; logger: LoggerService }) {
    this.scmClientFactory = new ScmClientFactory(options);
    this.logger = options.logger;
  }

  async createCrawler(
    sourceConfig: AnsibleGitContentsSourceConfig,
  ): Promise<ScmCrawler> {
    const { scmProvider, host, organization } = sourceConfig;

    const scmClient = await this.scmClientFactory.createClient({
      scmProvider,
      host,
      organization,
    });

    if (scmProvider === 'github') {
      return new GithubCrawler({
        sourceConfig,
        logger: this.logger,
        scmClient,
      });
    } else if (scmProvider === 'gitlab') {
      return new GitlabCrawler({
        sourceConfig,
        logger: this.logger,
        scmClient,
      });
    }

    throw new Error(`Unsupported SCM provider: ${scmProvider}`);
  }
}
