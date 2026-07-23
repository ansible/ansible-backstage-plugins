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

import { useEffect, useMemo, useState } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import '@patternfly/react-core/dist/styles/base.css';
import {
  ApmeApiProvider,
  ProjectWorkflowPanel,
  useProjectWorkflow,
  type ApmeApiAdapter,
} from '@apme/ui-workflow';
import {
  defaultBranchFromEntity,
  normalizeRepoUrlFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import { apmeApiRef } from '../../api';
import { createApmeUiWorkflowAdapter } from '../../api/createApmeUiWorkflowAdapter';
import { registerOrResolveApmeProject } from '../../utils/registerOrResolveApmeProject';
import { ensureRepoBranchForScan } from '../../utils/ensureRepoBranchForScan';
import { ApmeUnavailable } from '../ApmeUnavailable';

export interface ApmeEntityTabProps {
  /** Reserved for fleet drill-down; unused in eap-next thin mount. */
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
}

function WorkflowBody({ projectId }: { projectId: string }) {
  const workflow = useProjectWorkflow(projectId, {
    checkOptions: {
      ansibleVersion: '',
      collections: '',
      enableAi: false,
      autoApplyTier1: true,
    },
  });
  return (
    <ProjectWorkflowPanel
      workflow={workflow}
      enableAi={false}
      feedbackEnabled={false}
    />
  );
}

/**
 * Thin entity Quality tab: resolve/register APME project, mount shared
 * `@apme/ui-workflow` (ADR-056: Gateway owns SCM push; no file bundles).
 */
export const ApmeEntityTab = (_props: ApmeEntityTabProps) => {
  const { entity } = useEntity();
  const apmeApi = useApi(apmeApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [adapter, setAdapter] = useState<ApmeApiAdapter | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const repoUrl = useMemo(
    () => normalizeRepoUrlFromEntity(entity) ?? undefined,
    [entity],
  );
  const branch = useMemo(() => defaultBranchFromEntity(entity), [entity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await createApmeUiWorkflowAdapter({
          discoveryApi,
          fetchApi,
        });
        if (!cancelled) setAdapter(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!repoUrl) {
        setError(new Error('Entity has no source-location repository URL'));
        return;
      }
      try {
        await ensureRepoBranchForScan(apmeApi, repoUrl, branch);
        const name =
          entity.metadata.name ||
          repoUrl.replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '') ||
          'repository';
        const project = await registerOrResolveApmeProject(apmeApi, {
          name,
          repo_url: repoUrl,
          branch,
        });
        if (!cancelled) setProjectId(project.id);
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        const msg = err.message.toLowerCase();
        if (
          msg.includes('failed to fetch') ||
          msg.includes('network') ||
          msg.includes('econnrefused') ||
          msg.includes('unavailable')
        ) {
          setUnavailable(true);
        } else {
          setError(err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apmeApi, repoUrl, branch, entity.metadata.name]);

  if (unavailable) {
    return <ApmeUnavailable />;
  }
  if (error) {
    return <ResponseErrorPanel error={error} />;
  }
  if (!adapter || !projectId) {
    return <Progress />;
  }

  return (
    <ApmeApiProvider adapter={adapter}>
      <WorkflowBody projectId={projectId} />
    </ApmeApiProvider>
  );
};
