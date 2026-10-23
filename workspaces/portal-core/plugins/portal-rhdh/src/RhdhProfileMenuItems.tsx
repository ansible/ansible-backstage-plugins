import { compatWrapper } from '@backstage/core-compat-api';
import { useNativeAppProfileMenuItems } from '@ansible/portal-extension-host/alpha';
import { ProfileMenuItems } from '@ansible/portal-plugin-sdk';

/** Translate only the platform dropdown lifecycle; contributions stay Portal-owned. */
export function RhdhProfileMenuItems({
  handleClose,
}: {
  handleClose?: () => void;
}) {
  const items = useNativeAppProfileMenuItems();
  return compatWrapper(
    <ProfileMenuItems items={items} onClose={handleClose} />,
  );
}
