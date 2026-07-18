import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@backstage/ui/css/styles.css';

// Benign browser warning — suppress rspack dev overlay (Quality Rules, scaffolder, etc.)
const resizeObserverPattern = /ResizeObserver loop/;
window.addEventListener(
  'error',
  event => {
    if (
      resizeObserverPattern.test(event.message) ||
      (event.error instanceof Error &&
        resizeObserverPattern.test(event.error.message))
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return true;
    }
    return undefined;
  },
  true,
);

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
