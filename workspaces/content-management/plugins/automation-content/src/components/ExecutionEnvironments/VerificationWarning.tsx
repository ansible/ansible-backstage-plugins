import type { ReactElement } from 'react';
import type { ExecutionEnvironment } from '../../api';
import { StatusBadge, syncStatusIcon } from '../common';
import { isStale } from './catalogHelpers';

/** Small, accessible warning when an image has no recent successful verification. */
export function VerificationWarning({
  image,
}: {
  image: ExecutionEnvironment;
}): ReactElement | null {
  const timestampIsValid =
    !!image.lastReconciledAt &&
    Number.isFinite(new Date(image.lastReconciledAt).getTime());
  if (image.lastReconcileOk !== false && !isStale(image.lastReconciledAt)) {
    return null;
  }
  const label =
    image.lastReconcileOk === false || !timestampIsValid
      ? 'No successful verification'
      : 'Last verified over 6 months ago';
  return (
    <span role="note" aria-label={label} title={label}>
      <StatusBadge
        tone="warning"
        size="small"
        variant="outline"
        icon={syncStatusIcon('Stale')}
      >
        Needs verification
      </StatusBadge>
    </span>
  );
}
