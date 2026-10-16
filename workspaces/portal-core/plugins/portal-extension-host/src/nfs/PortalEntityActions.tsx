import { useEffect, useRef, useState } from 'react';
import {
  Button,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@material-ui/core';
import { useApi, useApiHolder } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { reconcileSubjectRemoval } from './reconcileSubjectRemoval';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { portalOperationsApiRef } from '@ansible/portal-extension-api';
import type {
  EntityActionDescriptor,
  EntityContributionContext,
  EntityDetailTabDescriptor,
  EntityOverviewCardDescriptor,
  CatalogItemActionDescriptor,
} from '@ansible/portal-extension-api/alpha';
import {
  resolveEntityContribution,
  useEligibleContributions,
  type EntitlementCheck,
} from './useEligibleContributions';
import {
  DEFAULT_EXPERIENCES,
  PortalEntityTabContent,
} from './PortalEntityTabs';
import { ErrorBoundary } from '../ErrorBoundary';
import { ContributionWrapper } from '../ContributionWrapper';
import { PortalEntityOverviewCards } from './PortalEntityOverviewCards';

const EMPTY_CARDS: readonly EntityOverviewCardDescriptor[] = [];

export function PortalOperationAction({
  action,
  context,
  eligibleTabs,
  onSelect,
  presentation = 'button',
  onSubjectRemoved,
}: {
  action: EntityActionDescriptor | CatalogItemActionDescriptor;
  context: EntityContributionContext;
  eligibleTabs?: readonly EntityDetailTabDescriptor[];
  onSelect: (id: string) => void;
  presentation?: 'button' | 'menu-item';
  onSubjectRemoved?: () => void;
}) {
  const operations = useApi(portalOperationsApiRef);
  const catalog = useApiHolder().get(catalogApiRef);
  const removalAccepted = useRef(false);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    message: string;
  }>();
  const inFlight = useRef(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [context],
  );
  const { entry } = resolveEntityContribution(action);
  if (!entry || entry.launches.type !== 'operation') return null;
  const launch = entry.launches;
  const targetAvailable =
    !launch.followOn ||
    ('followOnEntryPointId' in action &&
      eligibleTabs?.some(
        tab => tab.entryPointId === action.followOnEntryPointId,
      ));
  async function execute() {
    if (inFlight.current || !targetAvailable) return;
    inFlight.current = true;
    const started = generation.current;
    setPending(true);
    setFeedback(undefined);
    try {
      const subjectRef = stringifyEntityRef(context.entity);
      const response = removalAccepted.current
        ? undefined
        : await operations.execute(launch.operationId, {
            subject: { entityRef: subjectRef },
          });
      if (started !== generation.current) return;
      if (action.completion === 'subject-removed') {
        if (
          !removalAccepted.current &&
          (typeof response?.result !== 'object' ||
            response.result === null ||
            !('subjectRemoved' in response.result) ||
            response.result.subjectRemoved !== true)
        )
          throw new Error('Removal not confirmed');
        removalAccepted.current = true;
        const removed = catalog
          ? await reconcileSubjectRemoval(
              () => catalog.getEntityByRef(subjectRef),
              () => started === generation.current,
            )
          : false;
        if (started !== generation.current) return;
        if (!removed) {
          setFeedback({
            error: false,
            message:
              'Removal accepted. Catalog cleanup is still pending. Check again without resubmitting the removal.',
          });
          return;
        }
        setConfirmOpen(false);
        onSubjectRemoved?.();
      }
      setFeedback({
        error: false,
        message: `${
          entry!.label
        }: request accepted. Work may still be running.`,
      });
      if (
        launch.followOn &&
        'followOnEntryPointId' in action &&
        action.followOnEntryPointId
      )
        onSelect(action.followOnEntryPointId);
    } catch {
      if (started === generation.current)
        setFeedback({
          error: true,
          message: removalAccepted.current
            ? 'Removal accepted, but catalog verification failed. Check again; the removal will not be resubmitted.'
            : `${
                entry!.label
              }: request failed. Check the results before retrying; work may have started.`,
        });
    } finally {
      inFlight.current = false;
      if (started === generation.current) setPending(false);
    }
  }
  const activate = () => {
    if (action.confirmation) {
      setFeedback(undefined);
      setConfirmOpen(true);
    } else void execute();
  };
  let confirmLabel = action.confirmation?.confirmLabel;
  if (removalAccepted.current) confirmLabel = 'Check catalog removal';
  if (pending) confirmLabel = 'Removing…';
  return (
    <div>
      {presentation === 'menu-item' ? (
        <MenuItem disabled={pending || !targetAvailable} onClick={activate}>
          {pending ? `${entry.label}…` : entry.label}
        </MenuItem>
      ) : (
        <Button
          variant="outlined"
          color="primary"
          disabled={pending || !targetAvailable}
          onClick={activate}
        >
          {pending ? `${entry.label}…` : entry.label}
        </Button>
      )}
      {!targetAvailable && <span>Results view unavailable</span>}
      {action.confirmation && (
        <Dialog
          open={confirmOpen}
          onClose={() => {
            if (!pending) setConfirmOpen(false);
          }}
          disableBackdropClick
          disableEscapeKeyDown={pending}
          aria-labelledby={`confirm-${action.entryPointId}`}
        >
          <DialogTitle id={`confirm-${action.entryPointId}`}>
            {action.confirmation.title}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {context.entity.metadata.title ?? context.entity.metadata.name}
            </DialogContentText>
            <DialogContentText>
              {action.confirmation.description}
            </DialogContentText>
            {feedback && (
              <p role={feedback.error ? 'alert' : 'status'}>
                {feedback.message}
              </p>
            )}
          </DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              color="secondary"
              disabled={pending}
              onClick={() => void execute()}
            >
              {confirmLabel}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {feedback && !confirmOpen && (
        <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>
      )}
    </div>
  );
}

/** One host lifecycle evaluates both the operation action and its destination. */
export function PortalEntitySurface({
  tabs,
  actions,
  cards = EMPTY_CARDS,
  context,
  availableExperiences = DEFAULT_EXPERIENCES,
  checkEntitlement,
  onSubjectRemoved,
}: {
  tabs: readonly EntityDetailTabDescriptor[];
  actions: readonly EntityActionDescriptor[];
  cards?: readonly EntityOverviewCardDescriptor[];
  context: EntityContributionContext;
  availableExperiences?: readonly string[];
  checkEntitlement?: EntitlementCheck;
  onSubjectRemoved?: () => void;
}) {
  const eligibleTabs = useEligibleContributions(
    tabs,
    context,
    availableExperiences,
    checkEntitlement,
  );
  const eligibleActions = useEligibleContributions(
    actions,
    context,
    availableExperiences,
    checkEntitlement,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const eligibleCards = useEligibleContributions(
    cards,
    context,
    availableExperiences,
    checkEntitlement,
  );
  const [resultsRevision, setResultsRevision] = useState(0);
  const showResults = (id: string) => {
    setSelectedId(id);
    // Refresh even when the destination is already selected, to discover the accepted job.
    setResultsRevision(revision => revision + 1);
  };
  const subjectKey = stringifyEntityRef(context.entity);
  return (
    <>
      <div role="group" aria-label="Entity actions">
        {eligibleActions?.map(action => (
          <ErrorBoundary
            key={`${subjectKey}:${action.entryPointId}`}
            contributionId={action.entryPointId}
          >
            <ContributionWrapper>
              <PortalOperationAction
                action={action}
                context={context}
                eligibleTabs={eligibleTabs}
                onSelect={showResults}
                onSubjectRemoved={onSubjectRemoved}
              />
            </ContributionWrapper>
          </ErrorBoundary>
        ))}
      </div>
      <PortalEntityOverviewCards
        key={`cards:${subjectKey}:${resultsRevision}`}
        eligibleCards={eligibleCards}
        eligibleTabs={eligibleTabs}
        context={context}
        onSelect={setSelectedId}
      />
      <PortalEntityTabContent
        key={`${subjectKey}:${resultsRevision}`}
        eligible={eligibleTabs}
        context={context}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </>
  );
}
