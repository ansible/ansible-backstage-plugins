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
import {
  Button,
  Card,
  CardBody,
  Flex,
  FlexItem,
} from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import {
  AI_MODEL_STORAGE_KEY,
  ApmeApiProvider,
  CheckOptionsForm,
  ProjectWorkflowPanel,
  useProjectWorkflow,
  type ApmeApiAdapter,
} from '@apme/ui-workflow';
import type { Project } from '@ansible/backstage-apme-common';
import {
  defaultBranchFromEntity,
  normalizeRepoUrlFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import { apmeApiRef } from '../../api';
import { createApmeUiWorkflowAdapter } from '../../api/createApmeUiWorkflowAdapter';
import { registerOrResolveApmeProject } from '../../utils/registerOrResolveApmeProject';
import { ensureRepoBranchForScan } from '../../utils/ensureRepoBranchForScan';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { ApmeUnavailable } from '../ApmeUnavailable';

export interface ApmeEntityTabProps {
  /** Reserved for fleet drill-down; unused in eap-next thin mount. */
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
}

/**
 * Portal host chrome: Overview (idle) vs Session (live op).
 * ``ProjectWorkflowPanel`` is session-only — mounting it when detached shows a
 * permanent "Starting scan…" spinner (native SPA only mounts it when
 * ``sessionTabVisible``).
 */
function WorkflowBody({ projectId }: { projectId: string }) {
  const apmeApi = useApi(apmeApiRef);
  const portalAiEnabled = useApmeAiEnabled();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [ansibleVersion, setAnsibleVersion] = useState('');
  const [collections, setCollections] = useState('');
  const [enableAi, setEnableAi] = useState(portalAiEnabled);
  const [autoApplyTier1, setAutoApplyTier1] = useState(true);

  useEffect(() => {
    setEnableAi(portalAiEnabled);
  }, [portalAiEnabled]);

  const workflow = useProjectWorkflow(projectId, {
    checkOptions: {
      ansibleVersion,
      collections,
      enableAi: portalAiEnabled && enableAi,
      autoApplyTier1,
    },
    getAiModel: () => localStorage.getItem(AI_MODEL_STORAGE_KEY) ?? undefined,
  });

  const { sessionTabVisible, isRunning, startScan, cancel } = workflow;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await apmeApi.getProject(projectId);
        if (!cancelled) setProject(next);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apmeApi, projectId, sessionTabVisible]);

  if (sessionTabVisible) {
    return (
      <ProjectWorkflowPanel
        workflow={workflow}
        enableAi={portalAiEnabled && enableAi}
        feedbackEnabled={false}
      />
    );
  }

  if (loadError) {
    return <ResponseErrorPanel error={loadError} />;
  }
  if (!project) {
    return <Progress />;
  }

  return (
    <Card>
      <CardBody>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
          <FlexItem>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{project.name}</div>
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              {project.repo_url} ({project.branch})
            </div>
          </FlexItem>
          <Flex gap={{ default: 'gapLg' }}>
            <FlexItem>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {project.health_score ?? '—'}
              </div>
              <div style={{ opacity: 0.7 }}>Health</div>
            </FlexItem>
            <FlexItem>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {project.total_violations ?? 0}
              </div>
              <div style={{ opacity: 0.7 }}>Violations</div>
            </FlexItem>
            <FlexItem>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {project.scan_count ?? 0}
              </div>
              <div style={{ opacity: 0.7 }}>Scans</div>
            </FlexItem>
          </Flex>
          <FlexItem>
            <CheckOptionsForm
              ansibleVersion={ansibleVersion}
              onAnsibleVersionChange={setAnsibleVersion}
              collections={collections}
              onCollectionsChange={setCollections}
              enableAi={portalAiEnabled && enableAi}
              onEnableAiChange={checked => {
                if (portalAiEnabled) setEnableAi(checked);
              }}
              autoApplyTier1={autoApplyTier1}
              onAutoApplyTier1Change={setAutoApplyTier1}
              idPrefix="portal-quality"
            />
            {!portalAiEnabled ? (
              <div style={{ opacity: 0.7, marginTop: 8, fontSize: 13 }}>
                AI is disabled in portal config (`ansible.apme.enableAi`).
              </div>
            ) : null}
          </FlexItem>
          <Flex gap={{ default: 'gapSm' }}>
            <Button
              variant="primary"
              isDisabled={isRunning}
              onClick={() => {
                void startScan();
              }}
            >
              Scan
            </Button>
            {isRunning ? (
              <Button variant="link" onClick={() => void cancel()}>
                Cancel
              </Button>
            ) : null}
          </Flex>
        </Flex>
      </CardBody>
    </Card>
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
