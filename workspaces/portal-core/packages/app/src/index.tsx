import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import { lazy, Suspense, type ComponentType } from 'react';
import '@backstage/ui/css/styles.css';

const App = lazy<ComponentType>(() =>
  new URLSearchParams(window.location.search).get('portalFrontend') === 'legacy'
    ? import('./App')
    : import('./AppNfs').then(module => ({ default: () => module.default })),
);

function SelectedApp() {
  return (
    <Suspense fallback={<div>Loading Portal…</div>}>
      <App />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<SelectedApp />);
