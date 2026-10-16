beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  jest.clearAllMocks();
});

// Mock side-effect-only modules (assets/CSS)
jest.mock('@backstage/cli/asset-types', () => ({}), { virtual: true });
jest.mock('@backstage/ui/css/styles.css', () => ({}), { virtual: true });

// Prepare spies for the root and createRoot
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({ render: mockRender }));

// IMPORTANT: export a default object that has createRoot, because the entry uses:
// import ReactDOM from 'react-dom/client'; ReactDOM.createRoot(...)
jest.mock('react-dom/client', () => ({
  __esModule: true,
  default: {
    createRoot: mockCreateRoot,
  },
}));

// Mock App default export so render receives a predictable React element
const MockApp = () =>
  React.createElement('div', { 'data-testid': 'mock-app' }, 'App');
jest.mock('./App', () => ({ __esModule: true, default: MockApp }));

test('calls createRoot and renders <App /> into #root', () => {
  // require the entry module AFTER mocks and DOM node are ready
  // adjust the path './index' if your entry file name differs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./index');

  const rootElem = document.getElementById('root');
  expect(rootElem).not.toBeNull();

  // createRoot should be called with the root element
  expect(mockCreateRoot).toHaveBeenCalledTimes(1);
  expect(mockCreateRoot).toHaveBeenCalledWith(rootElem);

  // render should have been called once with a React element
  expect(mockRender).toHaveBeenCalledTimes(1);
  const renderedElement = mockRender.mock.calls[0][0];
  expect(renderedElement).toBeDefined();
  expect(typeof renderedElement.type === 'function').toBe(true);
});
