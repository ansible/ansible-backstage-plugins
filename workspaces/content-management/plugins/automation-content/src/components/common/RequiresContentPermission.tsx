import type { ReactElement, ReactNode } from 'react';
import LockIcon from '@material-ui/icons/Lock';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { automationContentViewPermission } from '@ansible/automation-content-common/permissions';
import { EmptyState } from './EmptyState';

function PermissionDeniedState(): ReactElement {
  return (
    <EmptyState
      icon={<LockIcon />}
      title="Access needed"
      description="You do not have permission to view automation content. Ask your portal administrator for access."
    />
  );
}

/** Keep denied content routes explicit rather than falling back to a host 404. */
export function RequiresContentPermission({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <RequirePermission
      permission={automationContentViewPermission}
      errorPage={<PermissionDeniedState />}
    >
      {children}
    </RequirePermission>
  );
}
