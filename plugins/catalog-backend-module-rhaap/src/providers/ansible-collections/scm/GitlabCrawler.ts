import { RepositoryInfo } from '@ansible/backstage-rhaap-common';
import { BaseScmCrawler, DiscoveryOptions } from './ScmCrawler';
import type { DiscoveredGalaxyFile } from '../types';
import { validateGalaxyContent } from '../galaxySchema';
import yaml from 'yaml';

export class GitlabCrawler extends BaseScmCrawler {
  async discoverGalaxyFiles(
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]> {
    const repos = await this.getRepositories();

    this.logger.info(
      `[GitlabCrawler] Starting galaxy.yml discovery in ${repos.length} projects`,
    );

    return this.discoverGalaxyFilesInRepos(repos, options);
  }

  async discoverGalaxyFilesInRepos(
    repos: RepositoryInfo[],
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]> {
    const discovered: DiscoveredGalaxyFile[] = [];
    const skippedRepos: Array<{ repo: string; reason: string }> = [];

    for (const repo of repos) {
      try {
        const refsToSearch = await this.getRefsToSearch(repo, options);
        let repoCollectionCount = 0;

        for (const { ref, refType } of refsToSearch) {
          const galaxyFiles = await this.findGalaxyFilesInRepo(
            repo,
            ref,
            refType,
            options,
          );
          repoCollectionCount += galaxyFiles.length;
          discovered.push(...galaxyFiles);
        }

        if (repoCollectionCount === 0) {
          skippedRepos.push({
            repo: repo.fullPath,
            reason: 'no valid galaxy.yml/yaml files found',
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        skippedRepos.push({
          repo: repo.fullPath,
          reason: `error: ${errorMsg}`,
        });
        this.logger.warn(
          `[GitlabCrawler] Error discovering collections in ${repo.fullPath}: ${error}`,
        );
      }
    }

    if (skippedRepos.length > 0) {
      this.logger.info(
        `[GitlabCrawler] Skipped ${skippedRepos.length} projects with no collections:`,
      );
      for (const { repo, reason } of skippedRepos) {
        this.logger.info(`[GitlabCrawler]   - ${repo}: ${reason}`);
      }
    }

    this.logger.info(
      `[GitlabCrawler] Discovered ${discovered.length} galaxy.yml files in ${repos.length} projects`,
    );
    return discovered;
  }

  private async getRefsToSearch(
    repo: RepositoryInfo,
    options: DiscoveryOptions,
  ): Promise<Array<{ ref: string; refType: 'branch' | 'tag' }>> {
    const refs: Array<{ ref: string; refType: 'branch' | 'tag' }> = [];
    const searchedBranches = new Set<string>();

    this.logger.debug(
      `[${repo.fullPath}] Default branch: ${repo.defaultBranch}`,
    );
    refs.push({ ref: repo.defaultBranch, refType: 'branch' as const });
    searchedBranches.add(repo.defaultBranch);

    if (options.branches && options.branches.length > 0) {
      const allBranches = await this.getBranches(repo);
      this.logger.debug(
        `[${repo.fullPath}] Available branches: ${allBranches.join(', ') || 'none'}`,
      );
      this.logger.debug(
        `[${repo.fullPath}] Configured additional branches: ${options.branches.join(', ')}`,
      );

      const additionalBranches = allBranches.filter(
        b => options.branches!.includes(b) && !searchedBranches.has(b),
      );

      if (additionalBranches.length > 0) {
        this.logger.debug(
          `[${repo.fullPath}] Will also search branches: ${additionalBranches.join(', ')}`,
        );
        refs.push(
          ...additionalBranches.map(b => ({
            ref: b,
            refType: 'branch' as const,
          })),
        );
        additionalBranches.forEach(b => searchedBranches.add(b));
      }
    }

    this.logger.debug(
      `[${repo.fullPath}] Total branches to search: ${Array.from(searchedBranches).join(', ')}`,
    );

    if (options.tags && options.tags.length > 0) {
      const allTags = await this.getTags(repo);
      const matchingTags = this.filterTags(allTags, options.tags);
      refs.push(
        ...matchingTags.map(t => ({ ref: t, refType: 'tag' as const })),
      );
    }

    return refs;
  }

  private async findGalaxyFilesInRepo(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    options: DiscoveryOptions,
  ): Promise<DiscoveredGalaxyFile[]> {
    const discovered: DiscoveredGalaxyFile[] = [];

    this.logger.debug(
      `[GitlabCrawler] Searching ${repo.fullPath} on ${refType} '${ref}' (default branch: ${repo.defaultBranch})`,
    );

    if (options.galaxyFilePaths && options.galaxyFilePaths.length > 0) {
      for (const basePath of options.galaxyFilePaths) {
        const files = await this.crawlDirectory(
          repo,
          ref,
          basePath,
          options.crawlDepth,
        );
        for (const filePath of files) {
          const galaxyFile = await this.processGalaxyFile(
            repo,
            ref,
            refType,
            filePath,
          );
          if (galaxyFile) {
            discovered.push(galaxyFile);
          }
        }
      }
    } else {
      const files = await this.crawlDirectory(
        repo,
        ref,
        '',
        options.crawlDepth,
      );

      if (files.length === 0) {
        this.logger.debug(
          `[GitlabCrawler] No galaxy.yml files found in ${repo.fullPath}@${ref} after crawling`,
        );
      }

      for (const filePath of files) {
        const galaxyFile = await this.processGalaxyFile(
          repo,
          ref,
          refType,
          filePath,
        );
        if (galaxyFile) {
          discovered.push(galaxyFile);
        }
      }
    }

    return discovered;
  }

  private async crawlDirectory(
    repo: RepositoryInfo,
    ref: string,
    path: string,
    depth: number,
  ): Promise<string[]> {
    if (depth <= 0) {
      return [];
    }

    const galaxyFiles: string[] = [];

    try {
      const contents = await this.getContents(repo, ref, path);

      if (path === '' && contents.length === 0) {
        this.logger.warn(
          `[GitlabCrawler] Empty contents returned for ${repo.fullPath}@${ref} root directory`,
        );
      }

      for (const entry of contents) {
        if (entry.type === 'file' && this.isGalaxyFile(entry.name)) {
          this.logger.info(
            `[GitlabCrawler] Found galaxy file: ${repo.fullPath}/${entry.path}@${ref}`,
          );
          galaxyFiles.push(entry.path);
        } else if (entry.type === 'dir') {
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          const subFiles = await this.crawlDirectory(
            repo,
            ref,
            entry.path,
            depth - 1,
          );
          galaxyFiles.push(...subFiles);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (path === '') {
        this.logger.warn(
          `[GitlabCrawler] Failed to fetch contents for ${repo.fullPath}@${ref}: ${errorMsg}`,
        );
      } else {
        this.logger.debug(
          `[GitlabCrawler] Error crawling ${repo.fullPath}/${path}@${ref}: ${errorMsg}`,
        );
      }
    }

    return galaxyFiles;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.github',
      '.gitlab',
      '__pycache__',
      '.tox',
      '.venv',
      'venv',
      '.cache',
      'dist',
      'build',
      'docs',
      'tests',
      'test',
    ];
    return skipDirs.includes(name.toLowerCase());
  }

  private async processGalaxyFile(
    repo: RepositoryInfo,
    ref: string,
    refType: 'branch' | 'tag',
    path: string,
  ): Promise<DiscoveredGalaxyFile | null> {
    try {
      const content = await this.getFileContent(repo, ref, path);

      let parsed: unknown;
      try {
        parsed = yaml.parse(content);
      } catch (parseError) {
        this.logger.warn(
          `[GitlabCrawler] Invalid YAML in ${repo.fullPath}/${path}@${ref}: ${parseError}`,
        );
        return null;
      }

      const validation = validateGalaxyContent(parsed);
      if (!validation.success) {
        this.logger.debug(
          `[GitlabCrawler] Invalid galaxy.yml in ${repo.fullPath}/${path}@${ref}: ${validation.errors?.join(', ')}`,
        );
        return null;
      }

      return {
        repository: repo,
        ref,
        refType,
        path,
        content,
        metadata: validation.data!,
      };
    } catch (error) {
      this.logger.warn(
        `[GitlabCrawler] Error processing ${repo.fullPath}/${path}@${ref}: ${error}`,
      );
      return null;
    }
  }
}
