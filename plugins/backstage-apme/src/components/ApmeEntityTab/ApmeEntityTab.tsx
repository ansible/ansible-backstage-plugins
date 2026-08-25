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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { Button, Card, CardBody, Flex, FlexItem } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import {
  ApmeApiProvider,
  CheckOptionsForm,
  ProjectWorkflowPanel,
  useProjectWorkflow,
  type ProjectWorkflowController,
} from '@apme/ui-workflow';
import type { Project } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../../api';
import { useApmePortalAiState } from '../../hooks/useApmeEnabled';
import { useApmeWorkflowAiModel } from '../../hooks/useApmeWorkflowAiModel';
import { useResolveApmeProject } from '../../hooks/useResolveApmeProject';
import { useSyncPatternFlyTheme } from '../../hooks/useSyncPatternFlyTheme';
import { resolveDefaultAnsibleVersionForScan } from '../../utils/resolveDefaultAnsibleVersionForScan';
import { resolvePostPushDevSpacesUrl } from '../../utils/resolvePostPushDevSpacesUrl';
import { ApmeUnavailable } from '../ApmeUnavailable';
import { PostPushDevSpacesBanner } from '../EditInDevSpacesButton';
import { PreviewLabelRow } from '../PreviewChip';
import { ApmeScanOptionsFields } from './ApmeScanOptionsFields';

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
  const configApi = useApi(configApiRef);
  const { enabled: portalAiEnabled, loading: portalAiLoading } =
    useApmePortalAiState();
  const portalAiActive = !portalAiLoading && portalAiEnabled;
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [ansibleVersion, setAnsibleVersion] = useState('');
  const [collections, setCollections] = useState('');
  const [enableAi, setEnableAi] = useState(portalAiEnabled);
  const [autoApplyTier1, setAutoApplyTier1] = useState(false);
  /** Remediation branch captured from the last successful createPR/push. */
  const [pushedBranchName, setPushedBranchName] = useState<string | null>(null);

  useEffect(() => {
    if (portalAiLoading) {
      return;
    }
    setEnableAi(portalAiEnabled);
    if (!portalAiEnabled) {
      setAutoApplyTier1(false);
    }
  }, [portalAiEnabled, portalAiLoading]);

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

  const getAiModel = useApmeWorkflowAiModel();

  const workflow = useProjectWorkflow(projectId, {
    checkOptions: {
      ansibleVersion,
      collections,
      enableAi: portalAiActive && enableAi,
      autoApplyTier1: portalAiActive && autoApplyTier1,
    },
    getAiModel,
  });

  const { sessionTabVisible, isRunning, startScan, cancel, dismiss } = workflow;

  const createPRWithCapture = useCallback(
    async (options?: Parameters<ProjectWorkflowController['createPR']>[0]) => {
      const result = await workflow.createPR(options);
      if (result.branch_name) {
        setPushedBranchName(result.branch_name);
      }
      return result;
    },
    [workflow],
  );

  const handleStartScan = useCallback(async () => {
    setPushedBranchName(null);
    await startScan();
  }, [startScan]);

  const workflowForPanel = useMemo(
    (): ProjectWorkflowController => ({
      ...workflow,
      createPR: createPRWithCapture,
      dismiss: () => {
        setPushedBranchName(null);
        dismiss();
      },
    }),
    [workflow, createPRWithCapture, dismiss],
  );

  useEffect(() => {
    if (!sessionTabVisible) {
      setPushedBranchName(null);
    }
  }, [sessionTabVisible]);

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

  const devSpacesUrl = resolvePostPushDevSpacesUrl({
    sessionVisible: sessionTabVisible,
    devSpacesBaseUrl: configApi.getOptionalString('ansible.devSpaces.baseUrl'),
    repoUrl: project?.repo_url,
    pushedBranchName,
    projectBranch: project?.branch,
    prUrl: workflow.opState?.pr_url,
    operationStatus: workflow.opState?.status,
  });

  if (sessionTabVisible) {
    return (
      <>
        <PostPushDevSpacesBanner
          url={devSpacesUrl}
          branchName={pushedBranchName ?? undefined}
        />
        <ProjectWorkflowPanel
          workflow={workflowForPanel}
          enableAi={portalAiActive && enableAi}
          feedbackEnabled={false}
        />
      </>
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
            {portalAiActive ? (
              <CheckOptionsForm
                ansibleVersion={ansibleVersion}
                onAnsibleVersionChange={setAnsibleVersion}
                collections={collections}
                onCollectionsChange={setCollections}
                enableAi={enableAi}
                onEnableAiChange={setEnableAi}
                autoApplyTier1={autoApplyTier1}
                onAutoApplyTier1Change={setAutoApplyTier1}
                showAiOptions
                idPrefix="portal-quality"
              />
            ) : (
              <ApmeScanOptionsFields
                ansibleVersion={ansibleVersion}
                onAnsibleVersionChange={setAnsibleVersion}
                collections={collections}
                onCollectionsChange={setCollections}
                idPrefix="portal-quality"
              />
            )}
          </FlexItem>
          <Flex gap={{ default: 'gapSm' }}>
            <Button
              variant="primary"
              isDisabled={isRunning}
              onClick={() => {
                void handleStartScan();
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
