import { useNativeAppHeaderActions } from '@ansible/portal-extension-host/alpha';
import { compatWrapper } from '@backstage/core-compat-api';
import { GlobalHeader } from './GlobalHeader';

/** Shell actions are declared by installed contributors, not selected by plugin ID. */
export function NativeGlobalHeader() {
  const actions = useNativeAppHeaderActions('create');
  return compatWrapper(<GlobalHeader createActions={actions} />);
}
