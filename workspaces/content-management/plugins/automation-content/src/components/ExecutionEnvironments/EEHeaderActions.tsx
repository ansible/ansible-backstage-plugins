import { appTreeApiRef, useApi } from '@backstage/frontend-plugin-api';
import { ButtonLink, Flex } from '@backstage/ui';
import { useLocation } from 'react-router-dom';
import { SyncRegistriesDialog } from './SyncRegistriesDialog';

export function EEHeaderActions(): JSX.Element {
  const { pathname } = useLocation();
  const { tree } = useApi(appTreeApiRef).getTree();
  // The shared header can render on a direct Images URL while the tab is disabled.
  const imagesPage = tree.nodes.get('sub-page:automation-content/images');
  return (
    <Flex align="start" gap="2">
      {imagesPage?.instance && pathname.endsWith('/images') && (
        <SyncRegistriesDialog />
      )}
      <ButtonLink
        variant="primary"
        href="/create/templates?filters%5Bkind%5D=template&filters%5Btags%5D=execution-environment"
      >
        Create
      </ButtonLink>
    </Flex>
  );
}
