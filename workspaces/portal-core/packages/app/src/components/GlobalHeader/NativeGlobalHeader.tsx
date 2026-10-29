import { useNativeAppProfileMenuItems } from '@ansible/portal-extension-host/alpha';
import { compatWrapper } from '@backstage/core-compat-api';
import { GlobalHeader } from './GlobalHeader';

/** Only profile items are contributed to the global header. */
export function NativeGlobalHeader() {
  const profileItems = useNativeAppProfileMenuItems();
  return compatWrapper(<GlobalHeader profileItems={profileItems} />);
}
