import { useEffect, useRef, useState } from 'react';
import { MenuItem } from '@material-ui/core';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import type { ResolvedAppProfileMenuItem } from '@ansible/portal-extension-api/alpha';

function ProfileMenuItem({
  item,
  onClose,
}: Readonly<{
  item: ResolvedAppProfileMenuItem;
  onClose?: () => void;
}>) {
  const navigate = useNavigate();
  const errors = useApi(errorApiRef);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function activate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (item.type === 'navigation') {
        onClose?.();
        navigate(item.path);
      } else {
        let closed = false;
        const close = () => {
          if (!closed) {
            closed = true;
            onClose?.();
          }
        };
        await item.activate(close);
        if (mounted.current) close();
      }
    } catch {
      errors.post(
        new Error(`Unable to complete profile action: ${item.title}`),
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <MenuItem
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        void activate();
      }}
    >
      {item.title}
    </MenuItem>
  );
}

/** Host-owned rows; contributors supply validated navigation or lazy UI actions. */
export function ProfileMenuItems({
  items,
  onClose,
}: Readonly<{
  items: readonly ResolvedAppProfileMenuItem[];
  onClose?: () => void;
}>) {
  return (
    <>
      {items.map(item => (
        <ProfileMenuItem key={item.id} item={item} onClose={onClose} />
      ))}
    </>
  );
}
