import { screen } from '@testing-library/react';
import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { renderTestApp } from '@backstage/frontend-test-utils';
import automationContentPlugin from '../../alpha';
import { automationContentApiRef } from '../../api';
import { EEImageDetails } from './EEImageDetails';

const digest = 'sha256:0123456789abcdef';
const image = 'registry.example.com/team/network-ee';
const enumeration = { status: 'unknown', source: 'labels' } as const;
const artifactRef = `registry/team/network-ee@${digest}`;
const templatesRoute = createRouteRef();

it.each([
  ['tag=stable', `${image}:stable`],
  [`digest=${digest}`, `${image}@${digest}`],
])(
  'passes the selected image from %s to Templates',
  async (query, reference) => {
    renderTestApp({
      features: [
        automationContentPlugin,
        createFrontendPlugin({
          pluginId: 'portal-scaffolder',
          routes: { root: templatesRoute },
          extensions: [
            PageBlueprint.make({
              params: {
                path: '/custom-templates',
                routeRef: templatesRoute,
                loader: async () => <div>Templates</div>,
              },
            }),
          ],
        }),
        createFrontendPlugin({
          pluginId: 'image-details-test',
          extensions: [
            PageBlueprint.make({
              params: {
                path: '/details',
                loader: async () => (
                  <EEImageDetails
                    entity={{
                      apiVersion: 'backstage.io/v1alpha1',
                      kind: 'Component',
                      metadata: {
                        name: 'ee-repo',
                        annotations: {
                          'ansible.com/registry': 'registry',
                          'ansible.com/repository': 'team/network-ee',
                        },
                      },
                    }}
                  />
                ),
              },
            }),
          ],
        }),
      ],
      initialRouteEntries: [`/details?${query}`],
      apis: [
        [
          automationContentApiRef,
          {
            getEERepository: async (registry, repository) => ({
              registry,
              repository,
              entityRef: 'component:default/ee-repo',
              representativeRef: artifactRef,
              tags: [
                {
                  tag: 'latest',
                  artifactRef,
                  digest,
                  taggedPullReference: `${image}:latest`,
                },
                {
                  tag: 'stable',
                  artifactRef,
                  digest,
                  taggedPullReference: `${image}:stable`,
                },
              ],
              digests: [{ artifactRef, digest }],
            }),
            getEEArtifact: async () => ({
              registry: 'registry',
              repository: 'team/network-ee',
              ref: artifactRef,
              digest,
              tags: ['latest', 'stable'],
              contentsKnown: false,
              enumeration,
              collections: [],
              pullReference: `${image}@${digest}`,
            }),
            getEEArtifactContents: async () => ({
              enumeration,
              items: [],
              collections: [],
            }),
            getRegistryStatus: async () => ({
              items: [],
              manualSyncEnabled: false,
            }),
          },
        ],
      ],
    });

    const link = await screen.findByRole<HTMLAnchorElement>('link', {
      name: 'Use in Controller',
    });
    const destination = new URL(link.href);
    expect(destination.pathname).toBe('/custom-templates');
    expect(destination.searchParams.get('create')).toBe('use-in-controller');
    expect(destination.searchParams.get('eeName')).toBe('network-ee');
    expect(destination.searchParams.get('eeImage')).toBe(reference);
    expect(destination.searchParams.get('eeRegistry')).toBe('registry');
    expect(destination.searchParams.get('eeRepository')).toBe(
      'team/network-ee',
    );
  },
);
