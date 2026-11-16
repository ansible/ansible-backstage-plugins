import { ButtonLink, Flex } from '@backstage/ui';
import { useLocation } from 'react-router-dom';
import { SyncRegistriesDialog } from './SyncRegistriesDialog';

export function EEHeaderActions(): JSX.Element {
  const { pathname } = useLocation();
  return (
    <Flex align="start" gap="2">
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
