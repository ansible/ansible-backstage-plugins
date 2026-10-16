import { useState } from 'react';
import { Button, Menu } from '@material-ui/core';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import type { useNativeEntityPage } from './useNativeEntityPage';
import { PortalOperationAction } from './PortalEntityActions';
import { ErrorBoundary } from '../ErrorBoundary';
import { stringifyEntityRef } from '@backstage/catalog-model';

export function NativeEntityActionMenu({
  contributions,
  onSubjectRemoved,
}: {
  contributions: NonNullable<ReturnType<typeof useNativeEntityPage>>;
  onSubjectRemoved?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!contributions.actions.length) return null;
  return (
    <>
      <Button
        variant="outlined"
        color="primary"
        endIcon={<ArrowDropDownIcon />}
        onClick={event => setAnchor(event.currentTarget)}
      >
        Actions
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {contributions.actions.map(action => (
          <ErrorBoundary
            key={`${stringifyEntityRef(contributions.context.entity)}:${
              action.entryPointId
            }`}
            contributionId={action.entryPointId}
          >
            <PortalOperationAction
              action={action}
              context={contributions.context}
              eligibleTabs={contributions.eligibleTabs}
              onSelect={id => {
                contributions.onSelect(id);
                setAnchor(null);
              }}
              presentation="menu-item"
              onSubjectRemoved={() => {
                setAnchor(null);
                onSubjectRemoved?.();
              }}
            />
          </ErrorBoundary>
        ))}
      </Menu>
    </>
  );
}
