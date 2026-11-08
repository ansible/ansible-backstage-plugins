import {
  clearControllerIntent,
  CONTROLLER_INTENT_PARAM,
  peekControllerIntent,
  setControllerIntent,
  takeControllerIntent,
} from './controllerDialogIntent';

describe('controller dialog intent', () => {
  afterEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('parks, peeks, takes and clears the intent in the URL', () => {
    expect(peekControllerIntent()).toBeNull();

    setControllerIntent('zot/demo/ee@sha256:abc');
    expect(peekControllerIntent()).toBe('zot/demo/ee@sha256:abc');
    expect(window.location.search).toContain(CONTROLLER_INTENT_PARAM);

    expect(takeControllerIntent()).toBe('zot/demo/ee@sha256:abc');
    expect(peekControllerIntent()).toBeNull();
  });

  it('peek does not consume: the intent survives a further redirect', () => {
    setControllerIntent('ref');
    expect(peekControllerIntent()).toBe('ref');
    expect(peekControllerIntent()).toBe('ref');
    expect(takeControllerIntent()).toBe('ref');
  });

  it('preserves other query parameters when clearing', () => {
    window.history.replaceState(null, '', '/content/ee/images?tab=overview');
    setControllerIntent('ref');
    clearControllerIntent();
    expect(window.location.search).toBe('?tab=overview');
  });

  it('removes the query string entirely when it held only the intent', () => {
    setControllerIntent('ref');
    clearControllerIntent();
    expect(window.location.search).toBe('');
  });

  it('clears without a query string without touching the path', () => {
    window.history.replaceState(null, '', '/content/ee/images');
    expect(() => clearControllerIntent()).not.toThrow();
    expect(window.location.pathname).toBe('/content/ee/images');
    expect(window.location.search).toBe('');
  });
});
