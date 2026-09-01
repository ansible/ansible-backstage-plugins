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

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  Card,
  CardBody,
  Spinner,
} from '@patternfly/react-core';
import {
  OperationPanel,
  type ProjectWorkflowController,
} from '@apme/ui-workflow';

export interface PortalProjectWorkflowPanelProps {
  workflow: ProjectWorkflowController;
  enableAi: boolean;
  feedbackEnabled: boolean;
  onViewDetails?: (scanId: string) => void;
  /** Rendered beside View pull request in commit/result steps (US-008). */
  hostShipActions?: ReactNode;
}

/**
 * Portal wrapper around {@link OperationPanel} that injects host actions
 * (e.g. Open in Dev Spaces) next to View pull request links.
 *
 * ponytail: DOM sibling injection until `@apme/ui-workflow` exposes
 * `hostShipActions` on OperationPanel / CommitChangesPanel.
 */
export function PortalProjectWorkflowPanel({
  workflow,
  enableAi,
  feedbackEnabled,
  onViewDetails,
  hostShipActions,
}: PortalProjectWorkflowPanelProps) {
  const {
    operationActive,
    opState,
    approve,
    beginRemediate,
    escalateAi,
    patchProposals,
    cancel,
    createPR,
    dismiss,
  } = workflow;
  const [draftError, setDraftError] = useState<string | null>(null);
  const draftGenRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [actionHost, setActionHost] = useState<HTMLElement | null>(null);
  const operationId = opState?.operation_id;
  const opStatus = opState?.status;

  useEffect(() => {
    draftGenRef.current += 1;
    setDraftError(null);
  }, [operationId, opStatus]);

  useLayoutEffect(() => {
    const root = panelRef.current;
    if (!root || !hostShipActions) {
      setActionHost(null);
      return undefined;
    }

    const locateActionHost = () => {
      const prControl = Array.from(
        root.querySelectorAll<HTMLElement>('a, button'),
      ).find(el => /view pull request/i.test(el.textContent ?? ''));
      if (!prControl?.parentElement) {
        setActionHost(null);
        return;
      }

      let slot = prControl.parentElement.querySelector<HTMLElement>(
        '[data-apme-host-ship-actions]',
      );
      if (!slot) {
        slot = document.createElement('span');
        slot.dataset.apmeHostShipActions = 'true';
        slot.style.display = 'inline-flex';
        prControl.insertAdjacentElement('beforebegin', slot);
      }
      setActionHost(slot);
    };

    locateActionHost();
    const observer = new MutationObserver(locateActionHost);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      setActionHost(null);
    };
  }, [hostShipActions, operationId, opStatus, opState?.pr_url]);

  if (!operationActive || !opState) {
    return (
      <Card>
        <CardBody style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Spinner size="lg" />
          <div style={{ marginTop: 12, fontSize: 16 }}>Starting scan…</div>
          <Button
            variant="link"
            onClick={dismiss}
            style={{ marginTop: 16 }}
          >
            Dismiss
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div ref={panelRef}>
      {actionHost && hostShipActions
        ? createPortal(hostShipActions, actionHost)
        : null}
      {draftError ? (
        <Alert
          variant="danger"
          title="Could not save draft proposals"
          isInline
          style={{ marginBottom: 12 }}
          actionClose={
            <AlertActionCloseButton onClose={() => setDraftError(null)} />
          }
        >
          {draftError}
        </Alert>
      ) : null}
      <OperationPanel
        state={opState}
        onApprove={approve}
        onBeginRemediate={beginRemediate}
        onEscalateAi={escalateAi}
        onDraftUpdate={updates => {
          const gen = draftGenRef.current;
          setDraftError(null);
          patchProposals(updates).catch(err => {
            if (gen !== draftGenRef.current) {
              return;
            }
            console.error('Failed to patch proposals:', err);
            setDraftError(
              err instanceof Error ? err.message : 'Draft update failed.',
            );
          });
        }}
        onCancel={cancel}
        onCreatePR={createPR}
        onDismiss={dismiss}
        feedbackEnabled={feedbackEnabled}
        enableAi={enableAi}
        onViewDetails={onViewDetails}
      />
    </div>
  );
}
