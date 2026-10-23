import { compatWrapper } from '@backstage/core-compat-api';
import { useNativeAppHeaderActions } from '@ansible/portal-extension-host/alpha';
import { CreateActionMenu } from '@ansible/portal-plugin-sdk';

/** Platform adapter only: ownership, destinations and permissions remain SDK-owned. */
export function RhdhCreateAction() {
  const actions = useNativeAppHeaderActions('create');
  return compatWrapper(<CreateActionMenu actions={actions} />);
}
