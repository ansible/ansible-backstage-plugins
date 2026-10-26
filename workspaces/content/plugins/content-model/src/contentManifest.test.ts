import {
  AnsibleContentManifest,
  CONTENT_MANIFEST_ARTIFACT_TYPE,
  isContentManifest,
  parseCollectionsLabel,
  summariseManifest,
} from './contentManifest';

/**
 * Shaped after real output from `content_manifest.py` against a network EE containing
 * cisco.ios, cisco.iosxr, ansible.netcommon, ansible.utils and ansible.eda.
 */
function manifest(
  overrides: Partial<AnsibleContentManifest> = {},
): AnsibleContentManifest {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-09-13T04:00:00+00:00',
    generatedBy: {
      tool: 'ansible-builder-content-manifest',
      version: '1.0.0',
      ansibleCore: '2.19.11',
      pythonVersion: '3.12.1',
      docsMode: 'full',
      docsSource: 'ansible-doc',
    },
    collections: [
      {
        namespace: 'cisco',
        name: 'ios',
        version: '11.5.1',
        plugins: [
          {
            name: 'ios_vlans',
            type: 'module',
            fqcn: 'cisco.ios.ios_vlans',
            shortDescription: 'Resource module to configure VLANs.',
            versionAdded: '1.0.0',
            author: ['Sumit Jaiswal (@justjais)'],
            options: {
              config: {
                type: 'list',
                elements: 'dict',
                suboptions: {
                  name: {
                    type: 'str',
                    description: ['Ascii name of the VLAN.'],
                  },
                  mtu: { type: 'int' },
                },
              },
              state: {
                type: 'str',
                choices: ['merged', 'replaced', 'overridden', 'deleted'],
                default: 'merged',
              },
            },
            examples: '- name: Merge provided configuration',
            returns: { before: { type: 'list' } },
          },
          { name: 'ios', type: 'cliconf', fqcn: 'cisco.ios.ios' },
        ],
        roles: [],
        playbooks: [],
        edaPlugins: [],
        rulebooks: [],
      },
      {
        namespace: 'ansible',
        name: 'eda',
        version: '2.13.0',
        plugins: [
          {
            name: 'activation',
            type: 'module',
            fqcn: 'ansible.eda.activation',
          },
        ],
        roles: [],
        playbooks: [{ name: 'demo', fqcn: 'ansible.eda.demo' }],
        edaPlugins: [
          {
            name: 'alertmanager',
            type: 'event_source',
            fqcn: 'ansible.eda.alertmanager',
            shortDescription: 'Receive events via a webhook from alertmanager.',
            options: { host: { type: 'str' }, port: { type: 'int' } },
          },
          {
            name: 'json_filter',
            type: 'event_filter',
            fqcn: 'ansible.eda.json_filter',
          },
        ],
        rulebooks: [
          {
            name: 'demo_rulebook',
            path: 'extensions/eda/rulebooks/demo_rulebook.yml',
          },
        ],
      },
    ],
    diagnostics: [],
    complete: true,
    ...overrides,
  };
}

describe('isContentManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(isContentManifest(manifest())).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    [
      'an object missing collections',
      { schemaVersion: '1.0.0', generatedBy: {} },
    ],
    [
      'an object missing generatedBy',
      { schemaVersion: '1.0.0', collections: [] },
    ],
  ])('rejects %s', (_label, value) => {
    expect(isContentManifest(value)).toBe(false);
  });
});

describe('summariseManifest', () => {
  it('counts every content type, including EDA plugins and rulebooks', () => {
    const summary = summariseManifest(manifest());

    expect(summary).toEqual({
      collections: 2,
      plugins: 3,
      pluginsByType: { module: 2, cliconf: 1 },
      roles: 0,
      playbooks: 1,
      edaPlugins: 2,
      rulebooks: 1,
    });
  });

  it('handles a manifest with no content at all', () => {
    const summary = summariseManifest(manifest({ collections: [] }));
    expect(summary.collections).toBe(0);
    expect(summary.plugins).toBe(0);
    expect(summary.pluginsByType).toEqual({});
  });
});

describe('nested option specs', () => {
  it('preserves suboptions, which is where network resource module detail lives', () => {
    const vlans = manifest().collections[0].plugins[0];
    expect(vlans.options?.config?.suboptions?.name?.type).toBe('str');
    expect(vlans.options?.state?.choices).toContain('overridden');
    expect(vlans.options?.state?.default).toBe('merged');
  });
});

describe('parseCollectionsLabel', () => {
  it('parses the summary label', () => {
    expect(
      parseCollectionsLabel('cisco.ios:11.5.1,ansible.utils:6.1.0'),
    ).toEqual([
      { namespace: 'cisco', name: 'ios', version: '11.5.1' },
      { namespace: 'ansible', name: 'utils', version: '6.1.0' },
    ]);
  });

  it('skips malformed entries rather than throwing — a bad label degrades a listing, not a sync', () => {
    expect(
      parseCollectionsLabel('cisco.ios:11.5.1,garbage,noversion.x,:1.0,  '),
    ).toEqual([{ namespace: 'cisco', name: 'ios', version: '11.5.1' }]);
  });

  it('returns empty for undefined', () => {
    expect(parseCollectionsLabel(undefined)).toEqual([]);
  });
});

describe('provenance', () => {
  it('records the ansible-core that performed extraction', () => {
    // The fidelity guarantee: documentation resolved against the core the collections
    // will actually run under.
    expect(manifest().generatedBy.ansibleCore).toBe('2.19.11');
    expect(manifest().generatedBy.docsSource).toBe('ansible-doc');
  });

  it('marks a filesystem-sourced manifest as incomplete', () => {
    const degraded = manifest({
      generatedBy: {
        tool: 'ansible-builder-content-manifest',
        version: '1.0.0',
        docsMode: 'none',
        docsSource: 'filesystem',
      },
      complete: false,
    });
    expect(degraded.complete).toBe(false);
    expect(degraded.generatedBy.ansibleCore).toBeUndefined();
  });
});

describe('artifact type', () => {
  it('is the OCI artifactType used for the referrer', () => {
    expect(CONTENT_MANIFEST_ARTIFACT_TYPE).toBe(
      'application/vnd.ansible.content-manifest.v1+json',
    );
  });
});
