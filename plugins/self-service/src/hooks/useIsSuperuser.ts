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

export interface UseIsSuperuserResult {
  isSuperuser: boolean;
  loading: boolean;
  error: Error | null;
}

export function useIsSuperuser(): UseIsSuperuserResult {
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);

  // initialize from cache if valid
  const [isSuperuser, setIsSuperuser] = useState(() => {
    if (
      superuserCache &&
      Date.now() - superuserCache.timestamp < CACHE_TTL_MS
    ) {
      return superuserCache.isSuperuser;
    }
    return false;
  });
  const [loading, setLoading] = useState(() => {
    // not loading if we have valid cache
    return !(
      superuserCache && Date.now() - superuserCache.timestamp < CACHE_TTL_MS
    );
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const updateState = (value: boolean, loadingState: boolean) => {
      if (mounted) {
        setIsSuperuser(value);
        setLoading(loadingState);
      }
    };

    const attemptFetch = async (
      userEntityRef: string,
    ): Promise<Entity | undefined> => {
      return fetchUserEntity(catalogApi, userEntityRef);
    };

    const checkSuperuserStatus = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const userEntityRef = identity.userEntityRef;

        if (isCacheValid(userEntityRef) && superuserCache) {
          updateState(superuserCache.isSuperuser, false);
          return;
        }

        setLoading(true);
        setError(null);

        if (!userEntityRef) {
          updateCache(false, null);
          updateState(false, false);
          return;
        }

        let userEntity: Entity | undefined;
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            userEntity = await attemptFetch(userEntityRef);
            lastError = undefined;
            break;
          } catch (err) {
            lastError =
              err instanceof Error
                ? err
                : new Error('Failed to check superuser status');
            if (attempt < MAX_ATTEMPTS && mounted) {
              // eslint-disable-next-line no-console
              console.warn(
                `[useIsSuperuser] Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`,
                lastError.message,
              );
              await new Promise(resolve =>
                setTimeout(resolve, RETRY_DELAY_MS),
              );
            }
          }
        }

        if (!mounted) return;

        if (lastError) {
          // eslint-disable-next-line no-console
          console.warn(
            '[useIsSuperuser] Failed to check superuser status after retry. ' +
              'The user may lack catalog.entity.read permission or the catalog entity may not exist yet.',
            lastError.message,
          );
          setError(lastError);
          setIsSuperuser(false);
          setLoading(false);
          return;
        }

        if (!userEntity) {
          // eslint-disable-next-line no-console
          console.warn(
            `[useIsSuperuser] User entity ${userEntityRef} not found in catalog. ` +
              'This may indicate catalog sync has not completed yet.',
          );
        }
        const isSuperuserValue = checkSuperuserAnnotation(userEntity);

        updateCache(isSuperuserValue, userEntityRef);
        updateState(isSuperuserValue, false);
      } catch (err) {
        if (mounted) {
          const errorObj =
            err instanceof Error
              ? err
              : new Error('Failed to check superuser status');
          // eslint-disable-next-line no-console
          console.warn(
            '[useIsSuperuser] Failed to check superuser status. ' +
              'The user may lack catalog.entity.read permission or the catalog entity may not exist yet.',
            errorObj.message,
          );
          setError(errorObj);
          setIsSuperuser(false);
          setLoading(false);
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
