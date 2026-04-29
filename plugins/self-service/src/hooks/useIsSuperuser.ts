import { useState, useEffect } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef, CatalogApi } from '@backstage/plugin-catalog-react';
import { Entity, parseEntityRef } from '@backstage/catalog-model';

const SUPERUSER_ANNOTATION = 'aap.platform/is_superuser';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 2;

// module level cache for superuser status
interface SuperuserCache {
  isSuperuser: boolean;
  timestamp: number;
  userRef: string | null;
}

let superuserCache: SuperuserCache | null = null;

function isCacheValid(userRef: string | undefined): boolean {
  return (
    superuserCache?.userRef === userRef &&
    superuserCache !== null &&
    Date.now() - superuserCache.timestamp < CACHE_TTL_MS
  );
}

function updateCache(isSuperuser: boolean, userRef: string | null): void {
  superuserCache = {
    isSuperuser,
    timestamp: Date.now(),
    userRef,
  };
}

async function fetchUserEntity(
  catalogApi: CatalogApi,
  userEntityRef: string,
): Promise<Entity | undefined> {
  const { kind, namespace, name } = parseEntityRef(userEntityRef);
  return catalogApi.getEntityByRef({
    kind,
    namespace: namespace || 'default',
    name,
  });
}

function checkSuperuserAnnotation(userEntity: Entity | undefined): boolean {
  const annotation = userEntity?.metadata?.annotations?.[SUPERUSER_ANNOTATION];
  return annotation === 'true';
}

function toError(err: unknown): Error {
  return err instanceof Error
    ? err
    : new Error('Failed to check superuser status');
}

function sanitizeForLog(message: string): string {
  return message.replaceAll(/https?:\/\/[^\s]+/g, '[redacted-url]');
}

function warnFailure(message: string, errorMessage?: string): void {
  // eslint-disable-next-line no-console
  console.warn(
    message,
    ...(errorMessage ? [sanitizeForLog(errorMessage)] : []),
  );
}

interface FetchWithRetryResult {
  userEntity?: Entity;
  lastError?: Error;
}

async function delayIfMounted(isMounted: () => boolean): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  return isMounted();
}

async function attemptFetch(
  catalogApi: CatalogApi,
  userEntityRef: string,
  attempt: number,
  isMounted: () => boolean,
): Promise<{ userEntity?: Entity; error?: Error; done: boolean }> {
  try {
    const userEntity = await fetchUserEntity(catalogApi, userEntityRef);
    if (userEntity || attempt === MAX_ATTEMPTS) {
      return { userEntity, done: true };
    }
    warnFailure(
      `[useIsSuperuser] User entity not found, retrying in ${RETRY_DELAY_MS}ms...`,
      'Entity not found',
    );
    const stillMounted = await delayIfMounted(isMounted);
    return { done: !stillMounted };
  } catch (err) {
    const error = toError(err);
    if (attempt < MAX_ATTEMPTS && isMounted()) {
      warnFailure(
        `[useIsSuperuser] Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`,
        error.message,
      );
      const stillMounted = await delayIfMounted(isMounted);
      if (!stillMounted) return { done: true };
    }
    return { error, done: attempt === MAX_ATTEMPTS };
  }
}

async function fetchWithRetry(
  catalogApi: CatalogApi,
  userEntityRef: string,
  isMounted: () => boolean,
): Promise<FetchWithRetryResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (!isMounted()) return {};

    const result = await attemptFetch(
      catalogApi,
      userEntityRef,
      attempt,
      isMounted,
    );
    if (result.userEntity !== undefined)
      return { userEntity: result.userEntity };
    if (result.error) lastError = result.error;
    if (result.done) break;
  }

  return { lastError };
}

export interface UseIsSuperuserResult {
  isSuperuser: boolean;
  loading: boolean;
  error: Error | null;
}

export function useIsSuperuser(): UseIsSuperuserResult {
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);

  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const handleFailure = (err: Error) => {
      warnFailure(
        '[useIsSuperuser] Failed to check superuser status. ' +
          'The user may lack catalog.entity.read permission or the catalog entity may not exist yet.',
        err.message,
      );
      setError(err);
      setIsSuperuser(false);
      setLoading(false);
    };

    const checkSuperuserStatus = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const userEntityRef = identity.userEntityRef;

        if (!mounted) return;

        if (isCacheValid(userEntityRef) && superuserCache) {
          setIsSuperuser(superuserCache.isSuperuser);
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        if (!userEntityRef) {
          updateCache(false, null);
          if (mounted) {
            setIsSuperuser(false);
            setLoading(false);
          }
          return;
        }

        const { userEntity, lastError } = await fetchWithRetry(
          catalogApi,
          userEntityRef,
          () => mounted,
        );

        if (!mounted) return;

        if (lastError) {
          handleFailure(lastError);
          return;
        }

        if (!userEntity) {
          warnFailure(
            `[useIsSuperuser] User entity not found in catalog. ` +
              'This may indicate catalog sync has not completed yet.',
          );
        }
        const isSuperuserValue = checkSuperuserAnnotation(userEntity);

        updateCache(isSuperuserValue, userEntityRef);
        if (mounted) {
          setIsSuperuser(isSuperuserValue);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          handleFailure(toError(err));
        }
      }
    };

    checkSuperuserStatus();

    return () => {
      mounted = false;
    };
  }, [identityApi, catalogApi]);

  return { isSuperuser, loading, error };
}

export function clearSuperuserCache(): void {
  superuserCache = null;
}
