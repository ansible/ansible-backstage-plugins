import { BaseScmCrawler } from './ScmCrawler';

export class GitlabCrawler extends BaseScmCrawler {
  protected getCrawlerName(): string {
    return 'GitlabCrawler';
  }

  protected getRepoLabel(): string {
    return 'projects';
  }
}
