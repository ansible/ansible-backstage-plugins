import { useEffect, useState } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import {
  AuthorizeResult,
  type BasicPermission,
} from '@backstage/plugin-permission-common';
import {
  permissionApiRef,
  type PermissionApi,
} from '@backstage/plugin-permission-react';

type PermissionDecision = 'allowed' | 'denied' | 'unavailable';

/** Check each mounted content surface before sending protected reads or refreshes. */
export function useContentPermission(
  permission: BasicPermission,
): PermissionDecision | 'pending' {
  const api = useApiHolder().get(permissionApiRef);
  const [result, setResult] = useState<{
    api: PermissionApi;
    permission: BasicPermission;
    decision: PermissionDecision;
  }>();

  useEffect(() => {
    if (!api) return undefined;
    let cancelled = false;
    const currentApi = api;
    async function check(): Promise<void> {
      let decision: PermissionDecision;
      try {
        const { result: authorized } = await currentApi.authorize({
          permission,
        });
        decision = authorized === AuthorizeResult.ALLOW ? 'allowed' : 'denied';
      } catch {
        decision = 'unavailable';
      }
      if (!cancelled) setResult({ api: currentApi, permission, decision });
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [api, permission]);

  if (!api) return 'unavailable';
  return result?.api === api && result.permission === permission
    ? result.decision
    : 'pending';
}
