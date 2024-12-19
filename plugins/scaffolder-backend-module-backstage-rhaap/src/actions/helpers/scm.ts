import { LoggerService } from '@backstage/backend-plugin-api';
import git, { ProgressCallback, AuthCallback } from 'isomorphic-git';
import fs from 'node:fs';
import http from 'isomorphic-git/http/node';

export type StaticAuthOptions = {
  username?: string;
  password?: string;
  token?: string;
  logger?: LoggerService;
};

export type AuthCallbackOptions = {
  onAuth: AuthCallback;
  logger?: LoggerService;
};

function isAuthCallbackOptions(
  options: StaticAuthOptions | AuthCallbackOptions,
): options is AuthCallbackOptions {
  return 'onAuth' in options;
}

export class Git {
  private readonly headers: {
    [x: string]: string;
  };
  private readonly onAuth: AuthCallback;

  private constructor(
    private readonly config: {
      onAuth: AuthCallback;
      token?: string;
      logger?: LoggerService;
    },
  ) {
    this.onAuth = config.onAuth;

    this.headers = {
      'user-agent': 'git/@isomorphic-git',
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    };
  }

  private onProgressHandler = (): ProgressCallback => {
    let currentPhase = '';

    return event => {
      if (currentPhase !== event.phase) {
        currentPhase = event.phase;
        this.config.logger?.info(event.phase);
      }
      const total = event.total
        ? `${Math.round((event.loaded / event.total) * 100)}%`
        : event.loaded;
      this.config.logger?.debug(`status={${event.phase},total={${total}}}`);
    };
  };

  async init(options: { dir: string; defaultBranch?: string }): Promise<void> {
    const { dir, defaultBranch = 'main' } = options;
    this.config.logger?.info(`Init git repository {dir=${dir}}`);

    return git.init({
      fs,
      dir,
      defaultBranch,
    });
  }

  async clone(options: {
    url: string;
    dir: string;
    ref?: string;
    depth?: number;
    noCheckout?: boolean;
  }): Promise<void> {
    const { url, dir, ref, depth, noCheckout } = options;
    this.config.logger?.info(`Cloning repo {dir=${dir},url=${url}}`);

    try {
      return await git.clone({
        fs,
        http,
        url,
        dir,
        ref,
        singleBranch: true,
        depth: depth ?? 1,
        noCheckout,
        onProgress: this.onProgressHandler(),
        headers: this.headers,
        onAuth: this.onAuth,
      });
    } catch (ex: any) {
      this.config.logger?.error(`Failed to clone repo {dir=${dir},url=${url}}`);
      if (ex.data) {
        throw new Error(`${ex.message} {data=${JSON.stringify(ex.data)}}`);
      }
      throw ex;
    }
  }

  async checkout(options: { dir: string; ref: string }): Promise<void> {
    const { dir, ref } = options;
    this.config.logger?.info(`Checking out branch {dir=${dir},ref=${ref}}`);
    return git.checkout({ fs, dir, ref });
  }

  async createBranch(options: { dir: string; ref: string }) {
    const { dir, ref } = options;
    this.config.logger?.info(`Creating new branch {dir=${dir},ref=${ref}}`);
    return await git.branch({ fs, dir, ref });
  }

  async createAndCheckout(options: {
    dir: string;
    ref: string;
  }): Promise<void> {
    await this.createBranch(options);
    return this.checkout(options);
  }

  async checkoutOrCreate(options: { dir: string; ref: string }): Promise<void> {
    try {
      return await this.checkout(options);
    } catch (e: any) {
      if (e?.code === 'NotFoundError') {
        return this.createAndCheckout(options);
      }
      const { dir, ref } = options;
      this.config.logger?.error(
        `Error checking out branch {dir=${dir},ref=${ref}}`,
      );
      throw new Error(`Error checking out branch {dir=${dir},ref=${ref}}`);
    }
  }

  async fetch(options: {
    dir: string;
    remote?: string;
    tags?: boolean;
  }): Promise<void> {
    const { dir, remote = 'origin', tags = false } = options;
    this.config.logger?.info(
      `Fetching remote=${remote} for repository {dir=${dir}}`,
    );

    try {
      await git.fetch({
        fs,
        http,
        dir,
        remote,
        tags,
        onProgress: this.onProgressHandler(),
        headers: this.headers,
        onAuth: this.onAuth,
      });
    } catch (ex: any) {
      this.config.logger?.error(
        `Failed to fetch repo {dir=${dir},remote=${remote}}`,
      );
      if (ex.data) {
        throw new Error(`${ex.message} {data=${JSON.stringify(ex.data)}}`);
      }
      throw ex;
    }
  }

  async commitAndPush(options: {
    url: string;
    dir: string;
    gitAuthorInfo: { name: string; email: string };
    commitMessage: string;
    branch?: string;
    remoteRef?: string;
  }) {
    const {
      url,
      dir,
      gitAuthorInfo,
      commitMessage,
      branch = 'main',
      remoteRef,
    } = options;
    await git.add({ fs, dir, filepath: '.' });
    const authorInfo = {
      name: gitAuthorInfo?.name ?? 'Scaffolder',
      email: gitAuthorInfo?.email ?? 'scaffolder@backstage.io',
    };
    const commitHash = await git.commit({
      fs,
      dir,
      message: commitMessage,
      author: authorInfo,
      committer: authorInfo,
    });
    await git.push({
      fs,
      dir,
      http,
      onProgress: this.onProgressHandler(),
      remoteRef: remoteRef ?? `refs/heads/${branch}`,
      remote: 'origin',
      headers: this.headers,
      url: url,
      onAuth: this.onAuth,
      corsProxy: '',
    });
    return { commitHash };
  }

  static fromAuth = (options: StaticAuthOptions | AuthCallbackOptions) => {
    if (isAuthCallbackOptions(options)) {
      const { onAuth, logger } = options;
      return new Git({ onAuth, logger });
    }

    const { username, password, token, logger } = options;
    return new Git({ onAuth: () => ({ username, password }), token, logger });
  };
}
