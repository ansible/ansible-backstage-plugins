import { ButtonIcon, ButtonLink, Flex } from '@backstage/ui';
import { RiSettings3Line } from '@remixicon/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SyncRegistriesDialog } from './SyncRegistriesDialog';

export function EEHeaderActions(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <Flex align="start" gap="2">
      <ButtonIcon
        variant="secondary"
        aria-label="Manage execution environment settings"
        icon={<RiSettings3Line />}
        onPress={() => navigate('/settings')}
      />
      {pathname.endsWith('/images') && <SyncRegistriesDialog />}
      <ButtonLink
        variant="primary"
        href="/create/templates?filters%5Bkind%5D=template&filters%5Btags%5D=execution-environment"
      >
        Create
      </ButtonLink>
    </Flex>
  );
}
