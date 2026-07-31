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

import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
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
} from '@apme/ui-workflow';
import type { Project } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../../api';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { useResolveApmeProject } from '../../hooks/useResolveApmeProject';
import { useSyncPatternFlyTheme } from '../../hooks/useSyncPatternFlyTheme';
import { resolveDefaultAnsibleVersionForScan } from '../../utils/resolveDefaultAnsibleVersionForScan';
import { ApmeUnavailable } from '../ApmeUnavailable';
import { PreviewLabelRow } from '../PreviewChip';

export interface ApmeEntityTabProps {
  /** Reserved — fleet drill-down targets Quality activity, not this tab. */
  initialRuleFilter?: string;
  initialCategoryFilter?: string;
}

/**
 * Portal host chrome: Overview (idle) vs Session (live op).
 * Findings / history live on Quality activity; this tab starts scans.
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
  const [autoApplyTier1, setAutoApplyTier1] = useState(false);

  useEffect(() => {
    setEnableAi(portalAiEnabled);
  }, [portalAiEnabled]);

  // Prefill from Quality settings / project scan-target (US-004).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const version = await resolveDefaultAnsibleVersionForScan(
        apmeApi,
        projectId,
      );
      if (!cancelled) {
        setAnsibleVersion(version);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apmeApi, projectId]);

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
          <PreviewLabelRow />
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
  // PF + @apme/ui-workflow dark tokens require pf-v6-theme-dark on <html>.
  useSyncPatternFlyTheme();

  const { adapter, projectId, error, unavailable } = useResolveApmeProject();

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
