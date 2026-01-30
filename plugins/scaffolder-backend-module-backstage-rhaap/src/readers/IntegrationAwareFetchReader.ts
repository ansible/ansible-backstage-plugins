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

import {
  UrlReaderService,
  UrlReaderServiceReadTreeResponse,
  UrlReaderServiceReadUrlOptions,
  UrlReaderServiceReadUrlResponse,
  UrlReaderServiceSearchOptions,
  UrlReaderServiceSearchResponse,
  RootConfigService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { NotFoundError, NotModifiedError } from '@backstage/errors';
import { ScmIntegrations } from '@backstage/integration';
import { Readable } from 'node:stream';

/**
 * A predicate that decides whether a specific UrlReaderService can handle a given URL.
 */
export type UrlReaderPredicateTuple = {
  predicate: (url: URL) => boolean;
  reader: UrlReaderService;
};

/**
 * A factory function that creates URL readers with predicates.
 */
export type ReaderFactory = (options: {
  config: RootConfigService;
  logger: LoggerService;
}) => UrlReaderPredicateTuple[];

/**
 * Builds a set of allowed hosts from all configured SCM integrations.
 * Includes GitHub, GitLab hosts and their associated raw content URL hosts.
 */
export function buildAllowedHostsFromIntegrations(
  config: RootConfigService,
  logger: LoggerService,
): Set<string> {
  const integrations = ScmIntegrations.fromConfig(config);
  const allowedHosts = new Set<string>();

  // Add GitHub hosts and their raw content variants
  for (const gh of integrations.github.list()) {
    const host = gh.config.host;
    allowedHosts.add(host);
    logger.debug(`[IntegrationAwareFetchReader] Allowing GitHub host: ${host}`);

    if (host === 'github.com') {
      // For github.com, raw content is served from raw.githubusercontent.com
      allowedHosts.add('raw.githubusercontent.com');
      logger.debug(
        `[IntegrationAwareFetchReader] Allowing raw.githubusercontent.com for github.com`,
      );
    }
    // For GHE, raw URLs are typically on the same host or /raw/ paths
  }

  // Add GitLab hosts
  for (const gl of integrations.gitlab.list()) {
    const host = gl.config.host;
    allowedHosts.add(host);
    logger.debug(`[IntegrationAwareFetchReader] Allowing GitLab host: ${host}`);
    // GitLab serves raw content from the same host via /-/raw/ paths
  }

  // Add Bitbucket hosts if configured
  for (const bb of integrations.bitbucket.list()) {
    const host = bb.config.host;
    allowedHosts.add(host);
    logger.debug(
      `[IntegrationAwareFetchReader] Allowing Bitbucket host: ${host}`,
    );
  }

  // Add Azure DevOps hosts if configured
  for (const azure of integrations.azure.list()) {
    const host = azure.config.host;
    allowedHosts.add(host);
    logger.debug(
      `[IntegrationAwareFetchReader] Allowing Azure DevOps host: ${host}`,
    );
  }

  return allowedHosts;
}

/**
 * A UrlReaderService that allows fetching from any host configured
 * in SCM integrations (GitHub, GitLab, Bitbucket, Azure DevOps).
 *
 * This reader acts as a fallback for URLs that aren't handled by the
 * built-in integration-specific readers (GithubUrlReader, GitlabUrlReader, etc.)
 * but should still be allowed based on the configured integrations.
 *
 * Common use cases:
 * - Raw content URLs (e.g., raw.githubusercontent.com)
 * - Template URLs from self-hosted SCM instances
 * - Catalog locations from enterprise GitHub/GitLab
 */
export class IntegrationAwareFetchReader implements UrlReaderService {
  /**
   * Factory function to create the reader with integration-based predicates.
   */
  static factory: ReaderFactory = ({ config, logger }) => {
    const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

    if (allowedHosts.size === 0) {
      logger.info(
        '[IntegrationAwareFetchReader] No SCM integrations configured, reader will not match any URLs',
      );
      return [];
    }

    logger.info(
      `[IntegrationAwareFetchReader] Initialized with ${allowedHosts.size} allowed hosts from integrations`,
    );

    const predicate = (url: URL) => allowedHosts.has(url.host);
    const reader = new IntegrationAwareFetchReader({
      allowedHosts,
      logger,
    });

    return [{ reader, predicate }];
  };

  readonly #allowedHosts: Set<string>;
  readonly #logger: LoggerService;

  private constructor(options: {
    allowedHosts: Set<string>;
    logger: LoggerService;
  }) {
    this.#allowedHosts = options.allowedHosts;
    this.#logger = options.logger;
  }

  async read(url: string): Promise<Buffer> {
    const response = await this.readUrl(url);
    return response.buffer();
  }

  async readUrl(
    url: string,
    options?: UrlReaderServiceReadUrlOptions,
  ): Promise<UrlReaderServiceReadUrlResponse> {
    const parsedUrl = new URL(url);

    if (!this.#allowedHosts.has(parsedUrl.host)) {
      throw new Error(
        `URL host not in configured integrations: ${parsedUrl.host}`,
      );
    }

    this.#logger.debug(
      `[IntegrationAwareFetchReader] Reading URL: ${parsedUrl.host}${parsedUrl.pathname}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...(options?.etag && { 'If-None-Match': options.etag }),
          ...(options?.lastModifiedAfter && {
            'If-Modified-Since': options.lastModifiedAfter.toUTCString(),
          }),
          ...(options?.token && { Authorization: `Bearer ${options.token}` }),
        },
        signal: options?.signal as AbortSignal | undefined,
      });
    } catch (e) {
      throw new Error(`Unable to read ${url}, ${e}`);
    }

    if (response.ok) {
      const etag = response.headers.get('etag') || undefined;
      const lastModifiedHeader = response.headers.get('last-modified');
      let lastModifiedAt: Date | undefined;
      if (lastModifiedHeader) {
        const parsedDate = new Date(lastModifiedHeader);
        // Only use the date if it's valid (not NaN)
        if (!Number.isNaN(parsedDate.getTime())) {
          lastModifiedAt = parsedDate;
        }
      }

      // Create a proper response object
      let cachedBuffer: Buffer | undefined;
      let stream: Readable | undefined;

      return {
        buffer: async () => {
          if (cachedBuffer === undefined) {
            const arrayBuffer = await response.arrayBuffer();
            cachedBuffer = Buffer.from(arrayBuffer);
          }
          return cachedBuffer;
        },
        stream: () => {
          if (!stream && response.body) {
            // ReadableStream from fetch is compatible with Readable.fromWeb
            stream = Readable.fromWeb(
              response.body as Parameters<typeof Readable.fromWeb>[0],
            );
          }
          if (!stream) {
            throw new Error('Response body is not available');
          }
          return stream;
        },
        etag,
        lastModifiedAt,
      };
    }

    if (response.status === 304) {
      throw new NotModifiedError();
    }

    const message = `could not read ${url}, ${response.status} ${response.statusText}`;
    if (response.status === 404) {
      throw new NotFoundError(message);
    }
    throw new Error(message);
  }

  async readTree(): Promise<UrlReaderServiceReadTreeResponse> {
    throw new Error('IntegrationAwareFetchReader does not implement readTree');
  }

  async search(
    url: string,
    options?: UrlReaderServiceSearchOptions,
  ): Promise<UrlReaderServiceSearchResponse> {
    const { pathname } = new URL(url);

    if (pathname.match(/[*?]/)) {
      throw new Error('Unsupported search pattern URL');
    }

    try {
      const data = await this.readUrl(url, options);

      return {
        files: [
          {
            url: url,
            content: data.buffer,
            lastModifiedAt: data.lastModifiedAt,
          },
        ],
        etag: data.etag ?? '',
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return {
          files: [],
          etag: '',
        };
      }
      throw error;
    }
  }

  toString() {
    return `IntegrationAwareFetchReader{hosts=${Array.from(this.#allowedHosts).join(',')}}`;
  }
}
