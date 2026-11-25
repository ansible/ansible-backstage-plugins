import { useEffect, useState, type PropsWithChildren } from 'react';
import { useEntity, EntityListProvider } from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/aap-common/permissions';
import { Alert, Button, Flex } from '@backstage/ui';
import { useNavigate } from 'react-router-dom';
import { RepositoryReadmeCard } from '../components/GitRepositories/RepositoryReadmeCard';
import { RepositoryAboutCard } from '../components/GitRepositories/RepositoryAboutCard';
import { RepositoriesCIActivityTab } from '../components/GitRepositories/RepositoriesCIActivityTab';
import { CollectionsListPage } from '../components/CollectionsCatalog/CollectionsListPage';
import { getSourceUrl } from '../components/CollectionsCatalog/utils';
import { buildRawReadmeFetchUrl } from '../components/GitRepositories/scmUtils';
import { fetchGitFileContentFromBackend } from '../components/common';

// Keep the existing repository permission on domain content at its new mount.
function RepositoryAccess({ children }: PropsWithChildren<{}>) {
  return (
    <RequirePermission permission={gitRepositoriesViewPermission}>
      {children}
    </RequirePermission>
  );
}

function Readme() {
  const { entity } = useEntity();
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [result, setResult] = useState({ text: '', loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    setResult({ text: '', loading: true, error: '' });
    const load = async () => {
      const annotations = entity.metadata.annotations ?? {};
      const provider = annotations['ansible.io/scm-provider']?.toLowerCase();
      const host = annotations['ansible.io/scm-host'];
      const org = annotations['ansible.io/scm-organization'];
      const repo = annotations['ansible.io/scm-repository'];
      const branch = String(entity.spec?.repository_default_branch || 'main');
      if (
        provider &&
        ['github', 'gitlab'].includes(provider) &&
        host &&
        org &&
        repo
      ) {
        const outcome = await fetchGitFileContentFromBackend(
          discovery,
          fetchApi,
          {
            scmProvider: provider,
            scmHost: host,
            scmOrg: org,
            scmRepo: repo,
            filePath: 'README.md',
            gitRef: branch,
          },
        );
        if (!outcome.ok) {
          if (outcome.reason === 'integration_auth')
            throw new Error('SCM integration authentication failed.');
          return '';
        }
        return outcome.data;
      }
      const source = getSourceUrl(entity);
      const url = source && buildRawReadmeFetchUrl(source, branch, 'README.md');
      if (!url) return '';
      const response = await fetch(url);
      if (response.status === 404) return '';
      if (!response.ok)
        throw new Error(`README request failed (${response.status}).`);
      return response.text();
    };
    void load().then(
      text => {
        if (!cancelled) setResult({ text, loading: false, error: '' });
      },
      error => {
        if (!cancelled)
          setResult({
            text: '',
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'README could not be loaded.',
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entity, discovery, fetchApi]);

  return (
    <Flex direction="column" gap="3">
      {result.error && <Alert status="warning" title={result.error} />}
      <RepositoryReadmeCard
        readmeContent={result.text}
        isLoading={result.loading}
      />
    </Flex>
  );
}

export function StockRepositoryReadme() {
  return (
    <RepositoryAccess>
      <Readme />
    </RepositoryAccess>
  );
}

function Info() {
  const { entity } = useEntity();
  const navigate = useNavigate();
  const entityPath = `/catalog/${encodeURIComponent(
    entity.metadata.namespace || 'default',
  )}/${encodeURIComponent(entity.kind.toLowerCase())}/${encodeURIComponent(
    entity.metadata.name,
  )}`;
  const source = getSourceUrl(entity);
  return (
    <Flex direction="column" gap="3">
      <Alert
        status="info"
        title="Stock entity-page proof"
        description="Backstage owns this header, tabs and overview layout. The comparison button opens the same repository in the current Portal page. APME integration is not yet proven here."
      />
      <Button
        variant="secondary"
        onPress={() =>
          navigate(
            `/self-service/repositories/${encodeURIComponent(
              entity.metadata.name,
            )}`,
          )
        }
      >
        Compare existing repository page
      </Button>
      <RepositoryAboutCard
        entity={entity}
        onViewSource={() => {
          if (source) window.open(source, '_blank', 'noopener,noreferrer');
        }}
        onNavigateToCollections={() =>
          navigate(`${entityPath}/repository-collections`)
        }
      />
    </Flex>
  );
}

export function StockRepositoryInfo() {
  return (
    <RepositoryAccess>
      <Info />
    </RepositoryAccess>
  );
}

function CI() {
  const { entity } = useEntity();
  return (
    <RepositoriesCIActivityTab
      filterByEntity={entity}
      cachedEntities={[entity]}
    />
  );
}

export function StockRepositoryCI() {
  return (
    <RepositoryAccess>
      <CI />
    </RepositoryAccess>
  );
}

function Collections() {
  const { entity } = useEntity();
  return (
    <EntityListProvider>
      <CollectionsListPage filterByRepositoryEntity={entity} />
    </EntityListProvider>
  );
}

export function StockRepositoryCollections() {
  return (
    <RepositoryAccess>
      <Collections />
    </RepositoryAccess>
  );
}
