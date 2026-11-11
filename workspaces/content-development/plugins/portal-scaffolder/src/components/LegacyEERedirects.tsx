import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import useAsync from 'react-use/lib/useAsync';

function DefinitionDestination({
  namespace,
  name,
}: Readonly<{ namespace: string; name: string }>) {
  return (
    <LegacyRedirect
      pathname={`/content/ee/catalog/${encodeURIComponent(
        namespace,
      )}/${encodeURIComponent(name)}`}
    />
  );
}

function LegacyRedirect({ pathname }: Readonly<{ pathname: string }>) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname, search, hash }} replace />;
}

function ResolveDefinition({ name }: Readonly<{ name: string }>) {
  const catalogApi = useApi(catalogApiRef);
  const { loading, value, error } = useAsync(
    () =>
      catalogApi.getEntities({
        filter: {
          kind: 'Component',
          'spec.type': 'execution-environment',
          'metadata.name': name,
        },
      }),
    [catalogApi, name],
  );
  if (loading) return <Progress />;
  if (error || value?.items.length !== 1) {
    return <LegacyRedirect pathname="/content/ee" />;
  }
  const { metadata } = value.items[0];
  return (
    <DefinitionDestination
      namespace={metadata.namespace ?? 'default'}
      name={metadata.name}
    />
  );
}

/** Resolve definition identity, never interpreting an old name as an OCI image. */
export function LegacyDefinitionRedirect() {
  const { namespace, name, templateName } = useParams();
  const definitionName = name ?? templateName;
  if (!definitionName) return <LegacyRedirect pathname="/content/ee" />;
  if (namespace) {
    return (
      <DefinitionDestination namespace={namespace} name={definitionName} />
    );
  }
  // Remount on name changes so an earlier lookup cannot redirect a newer URL.
  return <ResolveDefinition key={definitionName} name={definitionName} />;
}

/** Compatibility mount for existing static, dynamic and native EE bookmarks. */
export function LegacyEERedirects() {
  return (
    <Routes>
      <Route
        path="catalog/:namespace/:name"
        element={<LegacyDefinitionRedirect />}
      />
      <Route path="catalog/:name" element={<LegacyDefinitionRedirect />} />
      <Route path="*" element={<LegacyRedirect pathname="/content/ee" />} />
    </Routes>
  );
}
