import { Navigate, Route, Routes, useParams } from 'react-router-dom';

/** Only namespace-qualified definition URLs have a lossless new-route mapping. */
function LegacyDefinitionRedirect() {
  const { namespace, name } = useParams();
  return (
    <Navigate
      to={`/content/ee/catalog/${encodeURIComponent(
        namespace!,
      )}/${encodeURIComponent(name!)}`}
      replace
    />
  );
}

/** Compatibility mount for existing static, dynamic and native EE bookmarks. */
export function LegacyEERedirects() {
  return (
    <Routes>
      <Route
        path="catalog/:namespace/:name"
        element={<LegacyDefinitionRedirect />}
      />
      <Route path="*" element={<Navigate to="/content/ee" replace />} />
    </Routes>
  );
}
