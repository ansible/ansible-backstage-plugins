import { useState, useEffect } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { parseEntityRef } from '@backstage/catalog-model';

const SUPERUSER_ANNOTATION = 'aap.platform/is_superuser';

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

    const checkSuperuserStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        const identity = await identityApi.getBackstageIdentity();
        const userEntityRef = identity.userEntityRef;

        if (!userEntityRef) {
          if (mounted) {
            setIsSuperuser(false);
            setLoading(false);
          }
          return;
        }

        const { kind, namespace, name } = parseEntityRef(userEntityRef);

        const userEntity = await catalogApi.getEntityByRef({
          kind,
          namespace: namespace || 'default',
          name,
        });

        if (!userEntity) {
          if (mounted) {
            setIsSuperuser(false);
            setLoading(false);
          }
          return;
        }

        const superuserAnnotation =
          userEntity.metadata?.annotations?.[SUPERUSER_ANNOTATION];
        const isSuperuserValue = superuserAnnotation === 'true';

        if (mounted) {
          setIsSuperuser(isSuperuserValue);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to check superuser status'),
          );
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
