/* eslint-disable no-console */
import { act, render } from '@testing-library/react';
import {
  DynamicExtensionDiscovery,
  useIsDynamicEnvironment,
} from './DynamicExtensionDiscovery';
import { renderHook } from '@testing-library/react';
import {
  contributionRegistry,
  type PluginManifest,
} from '@ansible/portal-extension-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeManifest = (
  overrides: Partial<PluginManifest> = {},
): PluginManifest => ({
  id: 'test-plugin',
  version: '0.1.0',
  apiVersion: '0.1.0',
  capabilities: [],
  entitlements: [],
  ...overrides,
});

// ── DynamicExtensionDiscovery ─────────────────────────────────────────────────

describe('DynamicExtensionDiscovery', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    contributionRegistry.reset();
  });

  it('renders null — produces no DOM output', () => {
    const { container } = render(<DynamicExtensionDiscovery />);
    expect(container).toBeEmptyDOMElement();
  });

  // ── First-party manifest prop path ─────────────────────────────────────────

  it('logs console.info when a valid manifest is passed via prop', () => {
    render(
      <DynamicExtensionDiscovery
        manifests={[makeManifest()]}
        hostApiVersion="0.1.0"
      />,
    );
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"test-plugin" validated'),
    );
  });

  it('logs console.error when an invalid manifest is passed via prop', () => {
    const badManifest = makeManifest({ apiVersion: '9.9.9' });
    render(
      <DynamicExtensionDiscovery
        manifests={[badManifest]}
        hostApiVersion="0.1.0"
      />,
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"test-plugin" validation failed'),
      expect.anything(),
    );
  });

  it('validates multiple prop manifests independently', () => {
    render(
      <DynamicExtensionDiscovery
        manifests={[
          makeManifest({ id: 'plugin-a' }),
          makeManifest({ id: 'plugin-b' }),
        ]}
        hostApiVersion="0.1.0"
      />,
    );
    expect(console.info).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no manifests are provided', () => {
    render(<DynamicExtensionDiscovery />);
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  // ── Third-party manifest subscription path ─────────────────────────────────

  it('validates manifests registered before mount (subscription replay)', () => {
    contributionRegistry.registerManifest(
      makeManifest({ id: 'pre-registered' }),
    );
    render(<DynamicExtensionDiscovery hostApiVersion="0.1.0" />);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"pre-registered" validated'),
    );
  });

  it('validates manifests registered after mount', () => {
    render(<DynamicExtensionDiscovery hostApiVersion="0.1.0" />);
    act(() => {
      contributionRegistry.registerManifest(
        makeManifest({ id: 'late-plugin' }),
      );
    });
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"late-plugin" validated'),
    );
  });

  it('logs errors for invalid manifests arriving via subscription', () => {
    render(<DynamicExtensionDiscovery hostApiVersion="0.1.0" />);
    act(() => {
      contributionRegistry.registerManifest(
        makeManifest({ id: 'bad-plugin', apiVersion: '9.9.9' }),
      );
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"bad-plugin" validation failed'),
      expect.anything(),
    );
  });

  it('stops validating manifests after unmount (no memory leak)', () => {
    const { unmount } = render(
      <DynamicExtensionDiscovery hostApiVersion="0.1.0" />,
    );
    unmount();
    jest.clearAllMocks();
    contributionRegistry.registerManifest(
      makeManifest({ id: 'post-unmount-plugin' }),
    );
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

// ── useIsDynamicEnvironment ───────────────────────────────────────────────────

describe('useIsDynamicEnvironment', () => {
  it('returns false — Scalprum removed in RHDH 2.1, no detectable NFS global', () => {
    const { result } = renderHook(() => useIsDynamicEnvironment());
    expect(result.current).toBe(false);
  });
});
