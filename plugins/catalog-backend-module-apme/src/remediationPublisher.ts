/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import {
  ScmClientFactory,
  resolveGithubToken,
} from '@ansible/backstage-rhaap-common';
import type {
  CreatePullRequestResult,
  PushBranchResult,
  RemediationBundle,
} from '@ansible/backstage-apme-common/types';

interface GithubPublishContext {
  apiUrl: string;
  token: string;
  owner: string;
  repo: string;
}

function parseOwnerRepo(repoUrl: string): {
  owner: string;
  repo: string;
  host: string;
} {
  const parsed = new URL(repoUrl);
  const parts = parsed.pathname.replace(/^\//, '').split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new InputError(`Cannot extract owner/repo from URL: ${repoUrl}`);
  }
  return {
    host: parsed.host,
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ''),
  };
}

function isTextContent(data: Buffer): boolean {
  const checkLength = Math.min(data.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (data[i] === 0x00) return false;
  }
  return true;
}

async function githubRequest<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new InputError(
      `GitHub API error ${response.status}: ${body || response.statusText}`,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function resolveGithubContext(
  bundle: RemediationBundle,
  scmFactory: ScmClientFactory,
  userToken: string | undefined,
  logger: LoggerService,
): Promise<GithubPublishContext> {
  if (bundle.scm_provider !== 'github') {
    throw new InputError(
      `Portal SCM publish currently supports GitHub only (got ${bundle.scm_provider})`,
    );
  }

  const { owner, repo, host } = parseOwnerRepo(bundle.repo_url);
  const integration = scmFactory.integrations.github.byHost(host);
  const apiUrl = (
    integration?.config.apiBaseUrl ?? 'https://api.github.com'
  ).replace(/\/$/, '');

  let token = userToken?.trim();
  if (!token) {
    const resolved = await resolveGithubToken({
      integrations: scmFactory.integrations,
      credentialsProvider: scmFactory.githubCredentialsProvider,
      logger,
      host,
      organization: owner,
      repository: repo,
    });
    token = resolved.token;
  }

  if (!token) {
    throw new InputError(
      'No GitHub token available. Sign in to GitHub or configure integrations.github.',
    );
  }

  logger.info(
    `Using GitHub token for remediation publish on ${host}/${owner}/${repo}`,
  );
  return { apiUrl, token, owner, repo };
}

async function createGithubBranch(
  ctx: GithubPublishContext,
  baseBranch: string,
  branchName: string,
): Promise<void> {
  const ref = await githubRequest<{ object: { sha: string } }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    ctx.token,
  );

  try {
    await githubRequest(
      `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/refs`,
      ctx.token,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: ref.object.sha,
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes('422') &&
      !message.toLowerCase().includes('already exists')
    ) {
      throw error;
    }
  }
}

async function pushGithubFiles(
  ctx: GithubPublishContext,
  branchName: string,
  files: Record<string, Buffer>,
  commitMessage: string,
): Promise<void> {
  const headRef = await githubRequest<{ object: { sha: string } }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/ref/heads/${encodeURIComponent(branchName)}`,
    ctx.token,
  );
  const headCommit = await githubRequest<{ tree: { sha: string } }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/commits/${headRef.object.sha}`,
    ctx.token,
  );

  const treeItems: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
  }> = [];

  for (const [path, content] of Object.entries(files)) {
    const blobBody = isTextContent(content)
      ? { content: content.toString('utf8'), encoding: 'utf-8' }
      : {
          content: content.toString('base64'),
          encoding: 'base64',
        };
    const blob = await githubRequest<{ sha: string }>(
      `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/blobs`,
      ctx.token,
      { method: 'POST', body: JSON.stringify(blobBody) },
    );
    treeItems.push({
      path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const tree = await githubRequest<{ sha: string }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/trees`,
    ctx.token,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: headCommit.tree.sha,
        tree: treeItems,
      }),
    },
  );

  const commit = await githubRequest<{ sha: string }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/commits`,
    ctx.token,
    {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: tree.sha,
        parents: [headRef.object.sha],
      }),
    },
  );

  await githubRequest(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
    ctx.token,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    },
  );
}

async function createGithubPullRequest(
  ctx: GithubPublishContext,
  bundle: RemediationBundle,
  branchName: string,
): Promise<CreatePullRequestResult> {
  const pr = await githubRequest<{ html_url: string }>(
    `${ctx.apiUrl}/repos/${ctx.owner}/${ctx.repo}/pulls`,
    ctx.token,
    {
      method: 'POST',
      body: JSON.stringify({
        title: bundle.title,
        body: bundle.body,
        head: branchName,
        base: bundle.base_branch,
      }),
    },
  );
  return {
    pr_url: pr.html_url,
    branch_name: branchName,
    provider: 'github',
  };
}

function bundleFilesToMap(bundle: RemediationBundle): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  for (const file of bundle.files) {
    files[file.path] = Buffer.from(file.content_base64, 'base64');
  }
  return files;
}

export interface RemediationPublisherOptions {
  logger: LoggerService;
  scmFactory: ScmClientFactory;
}

export class RemediationPublisher {
  private readonly logger: LoggerService;
  private readonly scmFactory: ScmClientFactory;

  constructor(options: RemediationPublisherOptions) {
    this.logger = options.logger;
    this.scmFactory = options.scmFactory;
  }

  static fromConfig(options: {
    rootConfig: import('@backstage/config').Config;
    logger: LoggerService;
  }): RemediationPublisher {
    const scmFactory = new ScmClientFactory({
      rootConfig: options.rootConfig,
      logger: options.logger,
    });
    return new RemediationPublisher({
      logger: options.logger,
      scmFactory,
    });
  }

  async pushBranch(
    bundle: RemediationBundle,
    userToken: string | undefined,
    branchName?: string,
  ): Promise<PushBranchResult> {
    const targetBranch = branchName ?? bundle.branch_name;
    const ctx = await resolveGithubContext(
      bundle,
      this.scmFactory,
      userToken,
      this.logger,
    );
    await createGithubBranch(ctx, bundle.base_branch, targetBranch);
    await pushGithubFiles(
      ctx,
      targetBranch,
      bundleFilesToMap(bundle),
      bundle.title,
    );
    return {
      branch_name: targetBranch,
      provider: 'github',
      repo_url: bundle.repo_url,
    };
  }

  async createPullRequest(
    bundle: RemediationBundle,
    userToken: string | undefined,
    branchName: string,
  ): Promise<CreatePullRequestResult> {
    const ctx = await resolveGithubContext(
      bundle,
      this.scmFactory,
      userToken,
      this.logger,
    );
    return createGithubPullRequest(ctx, bundle, branchName);
  }

  /**
   * Commit full-file overrides onto an existing remediation branch
   * (portal Review & edit tweaks after gateway submit).
   */
  async commitFileOverrides(options: {
    repoUrl: string;
    branchName: string;
    files: Record<string, string>;
    userToken?: string;
    scmProvider?: string;
  }): Promise<void> {
    const paths = Object.keys(options.files);
    if (paths.length === 0) {
      return;
    }

    const bundle: RemediationBundle = {
      activity_id: '',
      project_id: '',
      repo_url: options.repoUrl,
      base_branch: options.branchName,
      scm_provider: options.scmProvider ?? 'github',
      branch_name: options.branchName,
      title: 'Apply reviewed remediation edits',
      body: '',
      files: [],
      fixed_count: 0,
      total_violations: 0,
    };

    const ctx = await resolveGithubContext(
      bundle,
      this.scmFactory,
      options.userToken,
      this.logger,
    );

    const buffers: Record<string, Buffer> = {};
    for (const [path, content] of Object.entries(options.files)) {
      buffers[path] = Buffer.from(content, 'utf8');
    }

    this.logger.info(
      `Applying ${paths.length} reviewed file override(s) on ${options.branchName}`,
    );
    await pushGithubFiles(
      ctx,
      options.branchName,
      buffers,
      'Apply reviewed remediation edits',
    );
  }
}
