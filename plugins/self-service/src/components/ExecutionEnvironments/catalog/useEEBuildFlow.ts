import { useCallback, useEffect, useRef, useState } from 'react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scmAuthApiRef } from '@backstage/integration-react';
import { useNotifications } from '../../notifications';
import { getScmRepoUrlForAuth } from './helpers';
import {
  EE_BUILD_PENDING_MAX_AGE_MS,
  EE_BUILD_PENDING_SESSION_KEY,
  type EeBuildPendingPayload,
} from './eeBuildSession';

export function useEEBuildFlow() {
  const scmAuthApi = useApi(scmAuthApiRef);
  const catalogApi = useApi(catalogApiRef);
  const { showNotification } = useNotifications();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [buildEntity, setBuildEntity] = useState<Entity | null>(null);
  /** SCM OAuth token for `POST /ansible/ee/build` (X-Github-Token). Cleared when the dialog closes. */
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const authInFlight = useRef(false);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setBuildEntity(null);
    setGithubToken(null);
  }, []);

  /** After full-page SCM OAuth, reopen the build dialog for the pending entity. */
  useEffect(() => {
    const raw = sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY);
    if (!raw) {
      return undefined;
    }

    let payload: EeBuildPendingPayload;
    try {
      payload = JSON.parse(raw) as EeBuildPendingPayload;
    } catch {
      sessionStorage.removeItem(EE_BUILD_PENDING_SESSION_KEY);
      return undefined;
    }

    if (
      !payload.entityRef ||
      typeof payload.savedAt !== 'number' ||
      Date.now() - payload.savedAt > EE_BUILD_PENDING_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(EE_BUILD_PENDING_SESSION_KEY);
      return undefined;
    }

    sessionStorage.removeItem(EE_BUILD_PENDING_SESSION_KEY);

    let cancelled = false;
    catalogApi
      .getEntityByRef(payload.entityRef)
      .then(resolved => {
        if (cancelled) {
          return;
        }
        if (!resolved) {
          showNotification({
            title: 'Build',
            description:
              'Could not load the execution environment after sign-in. Open Build again from the catalog or details page.',
            severity: 'error',
          });
          return;
        }
        const repoUrl = getScmRepoUrlForAuth(resolved);
        if (!repoUrl) {
          showNotification({
            title: 'Build',
            description:
              'This execution environment has no Git source metadata after sign-in. Open Build again from the catalog or details page.',
            severity: 'error',
          });
          return;
        }
        void scmAuthApi
          .getCredentials({ url: repoUrl })
          .then(creds => {
            if (cancelled) {
              return;
            }
            const tok = creds.token?.trim();
            if (!tok) {
              showNotification({
                title: 'Build',
                description:
                  'No Git token after sign-in. Open Build again to sign in to your Git host.',
                severity: 'error',
              });
              return;
            }
            setGithubToken(tok);
            setBuildEntity(resolved);
            setDialogOpen(true);
          })
          .catch((e: unknown) => {
            if (!cancelled) {
              showNotification({
                title: 'Sign-in failed',
                description: `Could not get Git credentials: ${e instanceof Error ? e.message : String(e)}`,
                severity: 'error',
              });
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          showNotification({
            title: 'Build',
            description:
              'Could not load the execution environment after sign-in. Open Build again from the catalog or details page.',
            severity: 'error',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catalogApi, scmAuthApi, showNotification]);

  const startBuildFlow = useCallback(
    async (entity: Entity) => {
      if (authInFlight.current) {
        return;
      }
      const repoUrl = getScmRepoUrlForAuth(entity);
      if (!repoUrl) {
        showNotification({
          title: 'Cannot start build',
          description:
            'Add backstage.io/source-location and ansible.io/scm-provider (GitHub or GitLab) on this execution environment.',
          severity: 'error',
        });
        return;
      }

      const entityRef = stringifyEntityRef({
        kind: entity.kind,
        namespace: entity.metadata.namespace,
        name: entity.metadata.name,
      });

      authInFlight.current = true;
      setAuthBusy(true);
      try {
        sessionStorage.setItem(
          EE_BUILD_PENDING_SESSION_KEY,
          JSON.stringify({
            entityRef,
            savedAt: Date.now(),
          } satisfies EeBuildPendingPayload),
        );
        const creds = await scmAuthApi.getCredentials({ url: repoUrl });
        sessionStorage.removeItem(EE_BUILD_PENDING_SESSION_KEY);
        const tok = creds.token?.trim();
        if (!tok) {
          showNotification({
            title: 'Cannot start build',
            description:
              'No Git token was returned after sign-in. Check GitHub (or GHE) authentication in Backstage.',
            severity: 'error',
          });
          return;
        }
        setGithubToken(tok);
        setBuildEntity(entity);
        setDialogOpen(true);
      } catch (e) {
        sessionStorage.removeItem(EE_BUILD_PENDING_SESSION_KEY);
        showNotification({
          title: 'Sign-in failed',
          description: `Could not sign in to your Git host: ${e instanceof Error ? e.message : String(e)}`,
          severity: 'error',
        });
      } finally {
        authInFlight.current = false;
        setAuthBusy(false);
      }
    },
    [scmAuthApi, showNotification],
  );

  return {
    startBuildFlow,
    authBusy,
    dialogOpen,
    buildEntity,
    githubToken,
    closeDialog,
  };
}
