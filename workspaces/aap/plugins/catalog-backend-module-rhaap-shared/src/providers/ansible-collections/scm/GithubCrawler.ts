import { BaseScmCrawler } from './ScmCrawler';

export class GithubCrawler extends BaseScmCrawler {
  protected getCrawlerName(): string {
    return 'GithubCrawler';
  }
}
