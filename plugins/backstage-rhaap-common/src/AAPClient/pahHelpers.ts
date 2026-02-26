import { LoggerService } from '@backstage/backend-plugin-api';
import { Collection } from '../interfaces';

export interface PAHHelperContext {
  logger: LoggerService;
  pluginLogName: string;
  executeGetRequest: (url: string, token: string | null) => Promise<Response>;
  isValidPAHRepository: (repositoryName: string) => Promise<boolean>;
}

export function sanitizePAHLimit(
  limit: number,
  context: PAHHelperContext,
): number {
  const maxLimit = 100;
  let sanitizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
  if (sanitizedLimit > maxLimit) {
    context.logger.warn(
      `[${context.pluginLogName}]: Limit value for PAH API endpoint '${limit}' exceeds maximum allowed. Limit cannot be more than ${maxLimit}.`,
    );
    sanitizedLimit = maxLimit;
  } else if (sanitizedLimit !== limit) {
    context.logger.warn(
      `[${context.pluginLogName}]: Invalid limit value for PAH API endpoint '${limit}'. Using sanitized value: ${sanitizedLimit}`,
    );
  }
  return sanitizedLimit;
}

export async function validateAndFilterRepositories(
  repositories: string[],
  context: PAHHelperContext,
): Promise<{ validRepos: string[]; urlSearchParams: URLSearchParams } | null> {
  const urlSearchParams = new URLSearchParams();
  const validRepositories: string[] = [];

  for (const repo of repositories) {
    try {
      const isValid = await context.isValidPAHRepository(repo);
      if (!isValid) {
        context.logger.warn(
          `[${context.pluginLogName}]: Repository '${repo}' is not a valid Private Automation Hub repository. Skipping.`,
        );
        continue;
      }
      validRepositories.push(repo);
      urlSearchParams.append('repository_name', repo);
    } catch (error) {
      context.logger.error(
        `[${context.pluginLogName}]: Error validating PAH repository '${repo}': ${String(error)}`,
      );
      continue;
    }
  }

  if (validRepositories.length === 0) {
    context.logger.warn(
      `[${context.pluginLogName}]: No valid repositories found after validation. Returning empty collection list.`,
    );
    return null;
  }

  context.logger.info(
    `[${context.pluginLogName}]: Fetching collections from ${validRepositories.length} valid repositories: ${validRepositories.join(', ')}`,
  );

  return { validRepos: validRepositories, urlSearchParams };
}

export async function fetchCollectionDetails(
  pulpHref: string,
  token: string | null,
  context: PAHHelperContext,
): Promise<{ docsBlob: string | null; authors: string[] | null }> {
  let docsBlob: string | null = null;
  let authors: string[] | null = null;

  try {
    const detailResponse = await context.executeGetRequest(pulpHref, token);
    if (detailResponse) {
      const detailData = await detailResponse.json();
      if (detailData) {
        docsBlob = detailData?.docs_blob?.collection_readme?.html ?? null;
        if (Array.isArray(detailData?.authors)) {
          authors = detailData.authors
            .map((a: unknown) =>
              typeof a === 'string'
                ? a
                : ((a as { name?: string })?.name ?? ''),
            )
            .filter(Boolean);
        }
      }
    }
  } catch (error) {
    context.logger.warn(
      `[${context.pluginLogName}]: Failed to fetch collection details from ${pulpHref}: ${String(error)}`,
    );
  }

  return { docsBlob, authors };
}

export async function processCollectionItem(
  item: any,
  token: string | null,
  context: PAHHelperContext,
): Promise<Collection | null> {
  const cv = item.collection_version;
  if (!cv) {
    context.logger.warn(
      `[${context.pluginLogName}]: Missing or invalid collection_version in item. Skipping.`,
    );
    return null;
  }

  const namespace = cv.namespace ?? null;
  const name = cv.name ?? null;
  if (!namespace || !name) {
    context.logger.warn(
      `[${context.pluginLogName}]: Collection missing required fields (namespace: '${namespace}', name: '${name}').`,
    );
    return null;
  }

  const repositoryName = item.repository?.name;
  if (!repositoryName || typeof repositoryName !== 'string') {
    context.logger.warn(
      `[${context.pluginLogName}]: Missing repository name for collection. Skipping.`,
    );
    return null;
  }

  let docsBlob: string | null = null;
  let authors: string[] | null = null;

  if (cv.pulp_href && typeof cv.pulp_href === 'string') {
    const details = await fetchCollectionDetails(cv.pulp_href, token, context);
    docsBlob = details.docsBlob;
    authors = details.authors;
  } else {
    context.logger.warn(
      `[${context.pluginLogName}]: Missing pulp_href for collection '${namespace}.${name}' in repository '${repositoryName}'.`,
    );
  }

  const dependencies: Record<string, string> | null =
    cv.dependencies && typeof cv.dependencies === 'object'
      ? cv.dependencies
      : null;
  const tags: string[] | null = Array.isArray(cv.tags)
    ? (cv.tags as unknown[])
        .map((t: unknown) =>
          typeof t === 'string' ? t : ((t as { name?: string })?.name ?? ''),
        )
        .filter(Boolean)
    : null;

  return {
    namespace,
    name,
    version: cv.version ?? null,
    dependencies,
    description: cv.description ?? null,
    tags,
    repository_name: repositoryName,
    collection_readme_html: docsBlob,
    authors,
  };
}

export async function fetchCollectionsPage(
  url: string,
  token: string | null,
  context: PAHHelperContext,
): Promise<{ collectionsData: any } | null> {
  try {
    const response = await context.executeGetRequest(url, token);
    const collectionsData = await response.json();

    if (!collectionsData) {
      context.logger.warn(
        `[${context.pluginLogName}]: Received empty response data from ${url}`,
      );
      return null;
    }

    return { collectionsData };
  } catch (error) {
    context.logger.error(
      `[${context.pluginLogName}]: Failed to fetch collections from ${url}: ${error}.`,
    );
    return null;
  }
}

export function extractNextUrl(collectionsData: any): string | null {
  const rawNextUrl = collectionsData?.links?.next;
  if (rawNextUrl && typeof rawNextUrl === 'string' && rawNextUrl.length > 0) {
    return rawNextUrl;
  }
  return null;
}
