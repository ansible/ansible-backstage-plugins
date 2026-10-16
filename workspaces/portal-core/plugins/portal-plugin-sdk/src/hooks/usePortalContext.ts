import { useState, useEffect } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

/** Display context from the authenticated host. Never use it as backend authority. */
export interface PortalContext {
  /** Present only when one organization is unambiguous. */
  organizationId?: string;
  /** Trusted configured memberships; repositories do not acquire these owners. */
  organizationIds: readonly string[];
  userEntityRef?: string;
}
export interface UsePortalContextResult extends PortalContext {
  loading: boolean;
  error: Error | null;
}

/** Reads host-resolved memberships, never the user entity's catalog namespace. */
export function usePortalContext(): UsePortalContextResult {
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [context, setContext] = useState<PortalContext>({
    organizationIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    setContext({ organizationIds: [] });
    setLoading(true);
    setError(null);
    (async () => {
      const baseUrl = await discovery.getBaseUrl('portal-operations');
      const response = await fetchApi.fetch(`${baseUrl}/context`);
      if (!response.ok)
        throw new Error(`Portal context failed (HTTP ${response.status})`);
      const value = await response.json();
      if (
        !value ||
        typeof value.userEntityRef !== 'string' ||
        (value.organizationId !== undefined &&
          (typeof value.organizationId !== 'string' ||
            !value.organizationId.trim())) ||
        (value.organizationIds !== undefined &&
          (!Array.isArray(value.organizationIds) ||
            value.organizationIds.some(
              (id: unknown) => typeof id !== 'string' || !id.trim(),
            )))
      ) {
        throw new Error('Invalid Portal organization context');
      }
      const organizationIds: string[] =
        value.organizationIds ??
        (value.organizationId ? [value.organizationId] : []);
      if (
        !organizationIds.length ||
        (value.organizationId &&
          !organizationIds.includes(value.organizationId))
      )
        throw new Error('Invalid Portal organization context');
      if (mounted)
        setContext({
          organizationId: value.organizationId,
          organizationIds,
          userEntityRef: value.userEntityRef,
        });
    })()
      .catch((cause: unknown) => {
        if (mounted)
          setError(
            cause instanceof Error
              ? cause
              : new Error('Failed to resolve portal context'),
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [discovery, fetchApi]);
  return { ...context, loading, error };
}
