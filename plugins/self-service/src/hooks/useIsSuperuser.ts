import { useState, useEffect } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef, CatalogApi } from '@backstage/plugin-catalog-react';
import { Entity, parseEntityRef } from '@backstage/catalog-model';

const SUPERUSER_ANNOTATION = 'aap.platform/is_superuser';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    const checkSuperuserStatus = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const userEntityRef = identity.userEntityRef;

        // use cached value if valid
        if (isCacheValid(userEntityRef) && superuserCache) {
          updateState(superuserCache.isSuperuser, false);
          return;
        }

        setLoading(true);
        setError(null);

        // no user entity ref -> not a superuser
        if (!userEntityRef) {
          updateCache(false, null);
          updateState(false, false);
          return;
        }

        const userEntity = await fetchUserEntity(catalogApi, userEntityRef);
        const isSuperuserValue = checkSuperuserAnnotation(userEntity);

        updateCache(isSuperuserValue, userEntityRef);
        updateState(isSuperuserValue, false);
      } catch (err) {
        if (mounted) {
          const errorObj =
            err instanceof Error
              ? err
              : new Error('Failed to check superuser status');
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
