import { UseCaseMaker } from './useCaseMaker';
import { ConfigReader } from '@backstage/config';
import { MOCK_CONFIG, MOCK_ORGANIZATION, MOCK_TOKEN } from '../../mock';
import { mockServices } from '@backstage/backend-test-utils';
import { setupServer } from 'msw/node';
import fs from 'node:fs';
import { http, HttpResponse } from 'msw';
import {
  AAPClient,
  getAnsibleConfig,
  Organization,
  UseCase,
} from '@ansible/backstage-rhaap-common';
import { mockAnsibleService } from '../mockIAAPService';

jest.mock('crypto');
const mockOctokit = {
  request: jest.fn(),
};

jest.mock('@octokit/rest');
jest.mock('octokit', () => ({
  Octokit: class {
    constructor() {
      return mockOctokit;
    }
  },
}));

jest.mock('isomorphic-git', () => {
  const mockGit = {
    init: jest.fn().mockResolvedValue(undefined),
    clone: jest.fn().mockResolvedValue(undefined),
    fetch: jest.fn().mockResolvedValue(undefined),
    checkout: jest.fn().mockResolvedValue('main'),
    createAndCheckout: jest.fn().mockResolvedValue('main'),
    checkoutOrCreate: jest.fn().mockResolvedValue('main'),
    commitAndPush: jest.fn().mockResolvedValue(undefined),
    listBranches: jest.fn().mockResolvedValue(['main', 'develop']),
    listFiles: jest.fn().mockResolvedValue(['file1.yml', 'file2.yml']),
    readObject: jest.fn().mockResolvedValue({ object: { data: 'content' } }),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ modified: [] }),
    log: jest.fn().mockResolvedValue([]),
    currentBranch: jest.fn().mockResolvedValue('main'),
    config: jest.fn().mockResolvedValue(undefined),
    setConfig: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockResolvedValue('test'),
    listConfig: jest.fn().mockResolvedValue([]),
    removeConfig: jest.fn().mockResolvedValue(undefined),
    listRemotes: jest.fn().mockResolvedValue([]),
    addRemote: jest.fn().mockResolvedValue(undefined),
    removeRemote: jest.fn().mockResolvedValue(undefined),
    getRemoteInfo: jest
      .fn()
      .mockResolvedValue({ refs: { heads: { main: 'abc123' } } }),
  };

  return {
    ...mockGit,
    default: mockGit,
  };
});

describe('ansible-aap:useCaseMaker:github', () => {
  let config;
  let ansibleConfig: any;
  const MOCK_CONF = {
    data: {
      integrations: {
        github: [
          {
            host: 'github.com',
            token: 'mockGitHubPAT',
          },
        ],
        gitlab: [
          {
            host: 'gitlab.com',
            token: 'mockGitlabPAT',
          },
        ],
      },
      ansible: {
        rhaap: {
          baseUrl: 'https://rhaap.test',
          token: MOCK_TOKEN,
          checkSSL: false,
          showCaseLocation: {
            type: 'url',
            target: 'https://github.com/testUser/testRepo',
            gitBranch: 'main',
            gitUser: 'testUser',
            gitEmail: 'username@example.com',
          },
        },
      },
    },
  };
  const logger = mockServices.logger.mock();
  const organization = MOCK_ORGANIZATION;
  const scmType = 'Github';
  const useCases = [
    {
      name: 'Cloud',
      version: 'main',
      url: 'https://github.com/userName/repoName',
    },
  ] as UseCase[];

  const handlers = [
    http.get(
      'https://api.github.com/repos/userName/repoName/contents/extensions/patterns',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json([{ path: 'test_folder', type: 'dir' }]),
        );
      },
    ),
    http.get(
      'https://api.github.com/repos/userName/repoName/contents/test_folder',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json([{ name: 'setup.yaml', type: 'file', path: 'test_file' }]),
        );
      },
    ),
    http.get(
      'https://api.github.com/repos/userName/repoName/contents/test_file',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json({
            name: 'setup.yaml',
            type: 'file',
            content:
              'LS0tCmNvbnRyb2xsZXJfbGFiZWxzOgogIC0gbmFtZTogY2xvdWQuYXdzX29wcwogICAgb3JnYW5pemF0aW9uOiAie3sgb3JnYW5pemF0aW9uIHwgZGVmYXVsdCgnRGVmYXVsdCcpIH19IgogIC0gbmFtZTogY29uZmlndXJlX2VjMl9wYXR0ZXJuCiAgICBvcmdhbml6YXRpb246ICJ7eyBvcmdhbml6YXRpb24gfCBkZWZhdWx0KCdEZWZhdWx0JykgfX0iCiAgLSBuYW1lOiBjcmVhdGVfZWMyX2luc3RhbmNlCiAgICBvcmdhbml6YXRpb246ICJ7eyBvcmdhbml6YXRpb24gfCBkZWZhdWx0KCdEZWZhdWx0JykgfX0iCiAgLSBuYW1lOiB0ZXJtaW5hdGVfZWMyX2luc3RhbmNlCiAgICBvcmdhbml6YXRpb246ICJ7eyBvcmdhbml6YXRpb24gfCBkZWZhdWx0KCdEZWZhdWx0JykgfX0iCgpjb250cm9sbGVyX3Byb2plY3RzOgogIC0gbmFtZTogQVdTIE9wZXJhdGlvbnMgLyBDb25maWd1cmUgRUMyIEluc3RhbmNlIFBhdHRlcm4gUHJvamVjdAogICAgb3JnYW5pemF0aW9uOiAie3sgb3JnYW5pemF0aW9uIHwgZGVmYXVsdCgnRGVmYXVsdCcpIH19IgogICAgc2NtX2JyYW5jaDogZWMyLWV4cGVyaWVuY2UKICAgIHNjbV9jbGVhbjogZmFsc2UKICAgIHNjbV9kZWxldGVfb25fdXBkYXRlOiBmYWxzZQogICAgc2NtX3R5cGU6IGdpdAogICAgc2NtX3VwZGF0ZV9vbl9sYXVuY2g6IHRydWUKICAgIHNjbV91cmw6IGh0dHBzOi8vZ2l0aHViLmNvbS9qdXN0aW5jMS9jbG91ZC5hd3Nfb3BzLmdpdAoKY29udHJvbGxlcl90ZW1wbGF0ZXM6CiAgLSBuYW1lOiBBV1MgT3BlcmF0aW9ucyAvIENyZWF0ZSBFQzIgSW5zdGFuY2UKICAgIGRlc2NyaXB0aW9uOiBUaGlzIGpvYiB0ZW1wbGF0ZSBjcmVhdGVzIGFuIEVDMiBpbnN0YW5jZSBhbmQgYXNzb2NpYXRlZCBuZXR3b3JraW5nIHJlc291cmNlcy4KICAgIGFza19pbnZlbnRvcnlfb25fbGF1bmNoOiB0cnVlCiAgICBhc2tfY3JlZGVudGlhbF9vbl9sYXVuY2g6IHRydWUKICAgIGFza192ZXJib3NpdHlfb25fbGF1bmNoOiB0cnVlCiAgICBleGVjdXRpb25fZW52aXJvbm1lbnQ6IEFXUyBPcGVyYXRpb25zIC8gQ29uZmlndXJlIEVDMiBJbnN0YW5jZSBQYXR0ZXJuIEV4ZWN1dGlvbiBFbnZpcm9ubWVudAogICAgcHJvamVjdDogQVdTIE9wZXJhdGlvbnMgLyBDb25maWd1cmUgRUMyIEluc3RhbmNlIFBhdHRlcm4gUHJvamVjdAogICAgcGxheWJvb2s6IGV4dGVuc2lvbnMvcGF0dGVybnMvY29uZmlndXJlX2VjMi9wbGF5Ym9va3MvY3JlYXRlX2VjMl9pbnN0YW5jZS55bWwKICAgIGpvYl90eXBlOiBydW4KICAgIG9yZ2FuaXphdGlvbjogInt7IG9yZ2FuaXphdGlvbiB8IGRlZmF1bHQoJ0RlZmF1bHQnKSB9fSIKICAgIGxhYmVsczoKICAgICAgLSBjbG91ZC5hd3Nfb3BzCiAgICAgIC0gY29uZmlndXJlX2VjMl9wYXR0ZXJuCiAgICAgIC0gY3JlYXRlX2VjMl9pbnN0YW5jZQogICAgc3VydmV5X2VuYWJsZWQ6IHRydWUKICAgIHN1cnZleV9zcGVjOiAie3sgbG9va3VwKCdmaWxlJywgcGF0dGVybi5wYXRoLnJlcGxhY2UoJ3NldHVwLnltbCcsICcnKSArICd0ZW1wbGF0ZV9zdXJ2ZXlzL2NyZWF0ZV9lYzJfaW5zdGFuY2UueW1sJykgfCBmcm9tX3lhbWwgfX0iCgogIC0gbmFtZTogQVdTIE9wZXJhdGlvbnMgLyBUZXJtaW5hdGUgRUMyIEluc3RhbmNlCiAgICBkZXNjcmlwdGlvbjogVGhpcyBqb2IgdGVtcGxhdGUgdGVybWluYXRlcyBhbiBFQzIgaW5zdGFuY2UgYW5kIGl0cyBhc3NvY2lhdGVkIG5ldHdvcmtpbmcgcmVzb3VyY2VzLgogICAgYXNrX2ludmVudG9yeV9vbl9sYXVuY2g6IHRydWUKICAgIGFza19jcmVkZW50aWFsX29uX2xhdW5jaDogdHJ1ZQogICAgYXNrX3ZlcmJvc2l0eV9vbl9sYXVuY2g6IHRydWUKICAgIGV4ZWN1dGlvbl9lbnZpcm9ubWVudDogQVdTIE9wZXJhdGlvbnMgLyBDb25maWd1cmUgRUMyIEluc3RhbmNlIFBhdHRlcm4gRXhlY3V0aW9uIEVudmlyb25tZW50CiAgICBwcm9qZWN0OiBBV1MgT3BlcmF0aW9ucyAvIENvbmZpZ3VyZSBFQzIgSW5zdGFuY2UgUGF0dGVybiBQcm9qZWN0CiAgICBwbGF5Ym9vazogZXh0ZW5zaW9ucy9wYXR0ZXJucy9jb25maWd1cmVfZWMyL3BsYXlib29rcy90ZXJtaW5hdGVfZWMyX2luc3RhbmNlLnltbAogICAgam9iX3R5cGU6IHJ1bgogICAgb3JnYW5pemF0aW9uOiAie3sgb3JnYW5pemF0aW9uIHwgZGVmYXVsdCgnRGVmYXVsdCcpIH19IgogICAgbGFiZWxzOgogICAgICAtIGNsb3VkLmF3c19vcHMKICAgICAgLSBjb25maWd1cmVfZWMyX3BhdHRlcm4KICAgICAgLSB0ZXJtaW5hdGVfZWMyX2luc3RhbmNlCiAgICBzdXJ2ZXlfZW5hYmxlZDogdHJ1ZQogICAgc3VydmV5X3NwZWM6ICJ7eyBsb29rdXAoJ2ZpbGUnLCBwYXR0ZXJuLnBhdGgucmVwbGFjZSgnc2V0dXAueW1sJywgJycpICsgJ3RlbXBsYXRlX3N1cnZleXMvdGVybWluYXRlX2VjMl9pbnN0YW5jZS55bWwnKSB8IGZyb21feWFtbCB9fSIKCmNvbnRyb2xsZXJfZXhlY3V0aW9uX2Vudmlyb25tZW50czoKICAtIG5hbWU6IEFXUyBPcGVyYXRpb25zIC8gQ29uZmlndXJlIEVDMiBJbnN0YW5jZSBQYXR0ZXJuIEV4ZWN1dGlvbiBFbnZpcm9ubWVudAogICAgZGVzY3JpcHRpb246IEV4ZWN1dGlvbiBlbnZpcm9ubWVudCBmb3IgdGhlIENvbmZpZ3VyZSBFQzIgSW5zdGFuY2UgUGF0dGVybgogICAgaW1hZ2U6IGRvY2tlci5pby9oYWtiYWlsZXkvYXdzX29wcy1lZTpsYXRlc3QKICAgIHB1bGw6IGFsd2F5cw==',
          }),
        );
      },
    ),
    http.get(
      'https://api.github.com/repos/userName/repoName/contents/test_folder/template_rhdh/create_ec2_instance.yml',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json({
            name: 'create_ec2_instance.yml',
            type: 'file',
            content:
              'YXBpVmVyc2lvbjogc2NhZmZvbGRlci5iYWNrc3RhZ2UuaW8vdjFiZXRhMwpraW5kOiBUZW1wbGF0ZQptZXRhZGF0YToKICBuYW1lOiBjbG91ZC1jb25maWd1cmUtZWMyCiAgdGl0bGU6IEFXUyBPcGVyYXRpb25zIC8gQ3JlYXRlIEVDMiBJbnN0YW5jZQogIGRlc2NyaXB0aW9uOiBUaGlzIHdpemFyZCB3aWxsIGd1aWRlIHlvdSBvbiBob3cgdG8gY3JlYXRlIEVDMiBpbnN0YW5jZSBpbiB0aGUgQW1hem9uIGNsb3VkCiAgbmFtZXNwYWNlOiBkZWZhdWx0CiAgdGFnczoKICAgIC0gYWFwLW9wZXJhdGlvbnMKICAgIC0gaW50ZXJtZWRpYXRlCiAgICAtIGNsb3VkLWF3cy1vcHMKICAgIC0gY29uZmlndXJlLWVjMi1wYXR0ZXJuCiAgICAtIGNyZWF0ZS1lYzItaW5zdGFuY2UKc3BlYzoKICB0eXBlOiBzZXJ2aWNlCiAgcGFyYW1ldGVyczoKICAgIC0gdGl0bGU6IFByb21wdHMKICAgICAgZGVzY3JpcHRpb246IENyZWF0ZSBFQzIgaW5zdGFuY2UgaW4gdGhlIEFtYXpvbiBjbG91ZAogICAgICByZXF1aXJlZDoKICAgICAgICAtIHRva2VuCiAgICAgICAgLSBpbnZlbnRvcnkKICAgICAgcHJvcGVydGllczoKICAgICAgICB0b2tlbjoKICAgICAgICAgIHRpdGxlOiBUb2tlbgogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICBkZXNjcmlwdGlvbjogT2F1dGgyIHRva2VuCiAgICAgICAgICB1aTpmaWVsZDogQUFQVG9rZW5GaWVsZAogICAgICAgICAgdWk6d2lkZ2V0OiBwYXNzd29yZAogICAgICAgICAgdWk6YmFja3N0YWdlOgogICAgICAgICAgICByZXZpZXc6CiAgICAgICAgICAgICAgc2hvdzogZmFsc2UKICAgICAgICBpbnZlbnRvcnk6CiAgICAgICAgICB0aXRsZTogSW52ZW50b3J5CiAgICAgICAgICBkZXNjcmlwdGlvbjogUGxlYXNlIGVudGVyIHRoZSBpbnZlbnRvcnkgeW91IHdhbnQgdG8gdXNlIHRoZSBzZXJ2aWNlcyBvbgogICAgICAgICAgcmVzb3VyY2U6IGludmVudG9yaWVzCiAgICAgICAgICB1aTpmaWVsZDogQUFQUmVzb3VyY2VQaWNrZXIKICAgICAgICBjcmVkZW50aWFsczoKICAgICAgICAgIHRpdGxlOiBDcmVkZW50aWFscwogICAgICAgICAgZGVzY3JpcHRpb246IFNlbGVjdCBjcmVkZW50aWFscyBmb3IgYWNjZXNzaW5nIEFXUy4KICAgICAgICAgICAgVGhlIGNyZWRlbnRpYWxzIG5lZWQgdG8gYmUgb2YgdHlwZSAiQW1hem9uIFdlYiBTZXJ2aWNlcyIuCiAgICAgICAgICB0eXBlOiBhcnJheQogICAgICAgICAgdWk6ZmllbGQ6IEFBUFJlc291cmNlUGlja2VyCiAgICAgICAgICByZXNvdXJjZTogY3JlZGVudGlhbHMKICAgICAgICB2ZXJib3NpdHk6CiAgICAgICAgICB0aXRsZTogVmVyYm9zaXR5CiAgICAgICAgICBkZXNjcmlwdGlvbjogQ29udHJvbCB0aGUgbGV2ZWwgb2Ygb3V0cHV0IEFuc2libGUgd2lsbCBwcm9kdWNlIGFzIHRoZSBwbGF5Ym9vayBleGVjdXRlcy4KICAgICAgICAgIHJlc291cmNlOiB2ZXJib3NpdHkKICAgICAgICAgIHVpOmZpZWxkOiBBQVBSZXNvdXJjZVBpY2tlcgogICAgLSB0aXRsZTogU3VydmV5CiAgICAgIHJlcXVpcmVkOgogICAgICAgIC0gYXdzX3JlZ2lvbgogICAgICAgIC0gaW5zdGFuY2VfbmFtZQogICAgICAgIC0gaW5zdGFuY2VfdHlwZQogICAgICBkZXNjcmlwdGlvbjogQ3JlYXRlIEVDMiBpbnN0YW5jZSBpbiB0aGUgQW1hem9uIGNsb3VkCiAgICAgIHByb3BlcnRpZXM6CiAgICAgICAgYXdzX3JlZ2lvbjoKICAgICAgICAgIHRpdGxlOiBBV1MgUmVnaW9uCiAgICAgICAgICBkZXNjcmlwdGlvbjogQVdTIHJlZ2lvbiB3aGVyZSByZXNvdXJjZXMgc2hvdWxkIGJlIGNyZWF0ZWQKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgIGluc3RhbmNlX25hbWU6CiAgICAgICAgICB0aXRsZTogSW5zdGFuY2UgTmFtZQogICAgICAgICAgZGVzY3JpcHRpb246IE5hbWUgb2YgRUMyIGluc3RhbmNlIHRvIGNyZWF0ZQogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAgaW5zdGFuY2VfdHlwZToKICAgICAgICAgIHRpdGxlOiBJbnN0YW5jZSBUeXBlCiAgICAgICAgICBkZXNjcmlwdGlvbjogVHlwZSBvZiBFQzIgaW5zdGFuY2UgdG8gY3JlYXRlIChlLmcuLCB0Mi5taWNybywgbTUubGFyZ2UpCiAgICAgICAgICB0eXBlOiBzdHJpbmcKICAgICAgICAgIHVpOm9wdGlvbnM6CiAgICAgICAgICAgIHJvd3M6IDUKICAgICAgICBhbWlfaWQ6CiAgICAgICAgICB0aXRsZTogQU1JIElECiAgICAgICAgICBkZXNjcmlwdGlvbjogQW1hem9uIE1hY2hpbmUgSW1hZ2UgKEFNSSkgSUQgdG8gdXNlIGZvciB0aGUgaW5zdGFuY2UsIGlmIG5vdCBwcm92aWRlZCB3aWxsIGRlZmF1bHQgdG8gdGhlIFJIRUwgOSBBTUkgZm9yIHRoZSBwcm92aWRlZCByZWdpb24gYW5kIGluc3RhbmNlIHR5cGUKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgIGtleV9uYW1lOgogICAgICAgICAgdGl0bGU6IEtleSBQYWlyIE5hbWUKICAgICAgICAgIGRlc2NyaXB0aW9uOiBOYW1lIG9mIGtleSBwYWlyIHRvIHVzZSBmb3IgU1NIIGFjY2VzcyB0byB0aGUgRUMyIGluc3RhbmNlLiBJZiB0aGUga2V5IGRvZXMgbm90IGV4aXN0IG9yIGlzIG5vdCBwcm92aWRlZCwgdGhlIGluc3RhbmNlIHdpbGwgbm90IGJlIGFjY2Vzc2libGUgdmlhIFNTSC4KICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgIHdhaXRfZm9yX3N0YXRlOgogICAgICAgICAgdGl0bGU6IFdhaXQgZm9yIFN0YXRlCiAgICAgICAgICBkZXNjcmlwdGlvbjogV2hldGhlciB0byB3YWl0IGZvciB0aGUgRUMyIGluc3RhbmNlIHRvIGJlIGluIHRoZSBydW5uaW5nIHN0YXRlIGJlZm9yZSBjb250aW51aW5nLiBEZWZhdWx0cyB0byB0cnVlCiAgICAgICAgICB0eXBlOiBzdHJpbmcKICAgICAgICAgIGVudW06CiAgICAgICAgICAgIC0gIiIKICAgICAgICAgICAgLSAndHJ1ZScKICAgICAgICAgICAgLSAnZmFsc2UnCiAgICAgICAgaW5zdGFuY2VfdGFnczoKICAgICAgICAgIHRpdGxlOiBJbnN0YW5jZSBUYWdzCiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0EgZGljdCBvZiB0YWdzIGZvciB0aGUgaW5zdGFuY2UsIGUuZy4geyJlbnZpcm9ubWVudDogdGVzdCIsICJvd25lciI6ICJ0ZWFtIGZvb2JhciJ9JwogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAgdnBjX25hbWU6CiAgICAgICAgICB0aXRsZTogVlBDIE5hbWUKICAgICAgICAgIGRlc2NyaXB0aW9uOiBOYW1lIG9mIHRoZSBWUEMgdG8gY3JlYXRlLiBEZWZhdWx0cyB0byAne3tpbnN0YW5jZV9uYW1lfX0tdnBjJwogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAgdnBjX2NpZHI6CiAgICAgICAgICB0aXRsZTogVlBDIENJRFIgQmxvY2sKICAgICAgICAgIGRlc2NyaXB0aW9uOiBDSURSIGJsb2NrIHRvIHVzZSBmb3IgdGhlIFZQQyBiZWluZyBjcmVhdGVkLiBEZWZhdWx0cyB0byAxMC4wLjAuMC8yNAogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAgc3VibmV0X2NpZHI6CiAgICAgICAgICB0aXRsZTogU3VibmV0IENJRFIgYmxvY2sKICAgICAgICAgIGRlc2NyaXB0aW9uOiBDSURSIGJsb2NrIHRvIHVzZSBmb3IgdGhlIHN1Ym5ldCBiZWluZyBjcmVhdGVkLiAxMC4wLjAuMC8yNQogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAgc2dfbmFtZToKICAgICAgICAgIHRpdGxlOiBTZWN1cml0eSBHcm91cCBOYW1lCiAgICAgICAgICBkZXNjcmlwdGlvbjogTmFtZSBvZiB0aGUgc2VjdXJpdHkgZ3JvdXAgdG8gY3JlYXRlIGZvciBzZWN1cmluZyB0cmFmZmljIHRvIHRoZSBpbnN0YW5jZS4gRGVmYXVsdHMgdG8gJ3t7IGluc3RhbmNlX25hbWUgfX0tc2cnCiAgICAgICAgICB0eXBlOiBzdHJpbmcKICAgICAgICAgIHVpOm9wdGlvbnM6CiAgICAgICAgICAgIHJvd3M6IDUKICAgICAgICBzZ19kZXNjcmlwdGlvbjoKICAgICAgICAgIHRpdGxlOiBTZWN1cml0eSBHcm91cCBEZXNjcmlwdGlvbgogICAgICAgICAgZGVzY3JpcHRpb246IERlc2NyaXB0aW9uIGZvciB0aGUgc2VjdXJpdHkgZ3JvdXAuIERlZmF1bHRzIHRvICdTZWN1cml0eSBncm91cCBmb3IgRUMyIGluc3RhbmNlIHt7IGluc3RhbmNlX25hbWUgfX0nCiAgICAgICAgICB0eXBlOiBzdHJpbmcKICAgICAgICAgIHVpOm9wdGlvbnM6CiAgICAgICAgICAgIHJvd3M6IDUKICAgICAgICBzZ19ydWxlczoKICAgICAgICAgIHRpdGxlOiBTZWN1cml0eSBHcm91cCBSdWxlcwogICAgICAgICAgZGVzY3JpcHRpb246ICdBIGxpc3Qgb2Ygc2VjdXJpdHkgZ3JvdXAgcnVsZXMgaW4geWFtbCBmb3JtYXQsIGUuZy46IC0gcHJvdG86IHRjcCBwb3J0czogODAgY2lkcl9pcDogMC4wLjAuMC8wIERlZmF1bHRzIHRvIGFsbG93aW5nIFNTSCBhY2Nlc3MgZnJvbSB3aXRoaW4gdGhlIFZQQycKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgICAgdWk6d2lkZ2V0OiB0ZXh0YXJlYQogICAgICAgIGV4dGVybmFsX2FjY2VzczoKICAgICAgICAgIHRpdGxlOiBDcmVhdGUgRXh0ZXJuYWwgQWNjZXNzIFJlc291cmNlcwogICAgICAgICAgZGVzY3JpcHRpb246IFdoZXRoZXIgdG8gY3JlYXRlIHJlc291cmNlcyBmb3IgZXh0ZXJuYWwgYWNjZXNzIHRvIHRoZSBFQzIgaW5zdGFuY2UuIERlZmF1bHRzIHRvIHRydWUuIFdoZW4gdHJ1ZSwgYWRkcyBzZWN1cml0eSBncm91cHMgcnVsZXMgYWxsb3dpbmcgaW5ib3VuZCBIVFRQIGFuZCBIVFRQUyB0cmFmZmljLCBjcmVhdGVzIGFuIGludGVybmV0IGdhdGV3YXksIGNyZWF0ZXMgYSBjdXN0b20gcm91dGUgdGFibGUgcm91dGluZyBhbGwgaW50ZXJuZXQgdHJhZmZpYyB0byB0aGUgZ2F0ZXdheSwgYW5kIGFsbG9jYXRlcyBhbiBlbGFzdGljIElQIGFkZHJlc3MgZm9yIHRoZSBpbnN0YW5jZS4KICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgZW51bToKICAgICAgICAgICAgLSAiIgogICAgICAgICAgICAtICd0cnVlJwogICAgICAgICAgICAtICdmYWxzZScKCiAgc3RlcHM6CiAgICAtIGlkOiBsYXVuY2gtam9iCiAgICAgIG5hbWU6IExhdW5jaCBBV1MgT3BlcmF0aW9ucyAvIENyZWF0ZSBFQzIgSW5zdGFuY2UKICAgICAgYWN0aW9uOiByaGFhcDpsYXVuY2gtam9iLXRlbXBsYXRlCiAgICAgIGlucHV0OgogICAgICAgIHRva2VuOiAke3sgcGFyYW1ldGVycy50b2tlbiB9fQogICAgICAgIHZhbHVlczoKICAgICAgICAgIGludmVudG9yeTogJHt7IHBhcmFtZXRlcnMuaW52ZW50b3J5ICB9fQogICAgICAgICAgY3JlZGVudGlhbHM6ICR7eyBwYXJhbWV0ZXJzLmNyZWRlbnRpYWxzIH19CiAgICAgICAgICB2ZXJib3NpdHk6ICR7e3BhcmFtZXRlcnMudmVyYm9zaXR5fX0KICAgICAgICAgIGV4dHJhVmFyaWFibGVzOgogICAgICAgICAgICBhd3NfcmVnaW9uOiAke3sgcGFyYW1ldGVycy5hd3NfcmVnaW9uICB9fQogICAgICAgICAgICBpbnN0YW5jZV9uYW1lOiAke3sgcGFyYW1ldGVycy5pbnN0YW5jZV9uYW1lICB9fQogICAgICAgICAgICBpbnN0YW5jZV90eXBlOiAke3sgcGFyYW1ldGVycy5pbnN0YW5jZV90eXBlICB9fQogICAgICAgICAgICBhbWlfaWQ6ICR7eyBwYXJhbWV0ZXJzLmFtaV9pZCAgfX0KICAgICAgICAgICAga2V5X25hbWU6ICR7eyBwYXJhbWV0ZXJzLmtleV9uYW1lICB9fQogICAgICAgICAgICB3YWl0X2Zvcl9zdGF0ZTogJHt7IHBhcmFtZXRlcnMud2FpdF9mb3Jfc3RhdGUgIH19CiAgICAgICAgICAgIGluc3RhbmNlX3RhZ3M6ICR7eyBwYXJhbWV0ZXJzLmluc3RhbmNlX3RhZ3MgIH19CiAgICAgICAgICAgIHZwY19uYW1lOiAke3sgcGFyYW1ldGVycy52cGNfbmFtZSAgfX0KICAgICAgICAgICAgdnBjX2NpZHI6ICR7eyBwYXJhbWV0ZXJzLnZwY19jaWRyICB9fQogICAgICAgICAgICBzdWJuZXRfY2lkcjogJHt7IHBhcmFtZXRlcnMuc3VibmV0X2NpZHIgIH19CiAgICAgICAgICAgIHNnX25hbWU6ICR7eyBwYXJhbWV0ZXJzLnNnX25hbWUgIH19CiAgICAgICAgICAgIHNnX2Rlc2NyaXB0aW9uOiAke3sgcGFyYW1ldGVycy5zZ19kZXNjcmlwdGlvbiAgfX0KICAgICAgICAgICAgc2dfcnVsZXM6ICR7eyBwYXJhbWV0ZXJzLnNnX3J1bGVzICB9fQogICAgICAgICAgICBleHRlcm5hbF9hY2Nlc3M6ICR7eyBwYXJhbWV0ZXJzLmV4dGVybmFsX2FjY2VzcyAgfX0KICBvdXRwdXQ6CiAgICB0ZXh0OgogICAgICAtIHRpdGxlOiBBV1MgT3BlcmF0aW9ucyAvIENyZWF0ZSBFQzIgSW5zdGFuY2UgdGVtcGxhdGUgZXhlY3V0ZWQKICAgICAgICAgIHN1Y2Nlc3NmdWxseQogICAgICAgIGNvbnRlbnQ6IHwKICAgICAgICAgICoqSm9iIElEOioqICR7eyBzdGVwc1snbGF1bmNoLWpvYiddLm91dHB1dC5kYXRhLmlkIH19CiAgICAgICAgICAqKkpvYiBTVEFUVVM6KiogJHt7IHN0ZXBzWydsYXVuY2gtam9iJ10ub3V0cHV0LmRhdGEuc3RhdHVzIH19CiAgICBsaW5rczoKICAgICAgLSB0aXRsZTogVmlldyBpbiBSSCBBQVAKICAgICAgICB1cmw6ICR7eyBzdGVwc1snbGF1bmNoLWpvYiddLm91dHB1dC5kYXRhLnVybCB9fQ==',
          }),
        );
      },
    ),
    http.get(
      'https://api.github.com/repos/userName/repoName/contents/test_folder/template_rhdh/terminate_ec2_instance.yml',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json({
            name: 'terminate_ec2_instance.yml',
            type: 'file',
            content:
              'YXBpVmVyc2lvbjogc2NhZmZvbGRlci5iYWNrc3RhZ2UuaW8vdjFiZXRhMwpraW5kOiBUZW1wbGF0ZQptZXRhZGF0YToKICBuYW1lOiBjbG91ZC10ZXJtaW5hdGUtZWMyCiAgdGl0bGU6IEFXUyBPcGVyYXRpb25zIC8gVGVybWluYXRlIEVDMiBJbnN0YW5jZQogIGRlc2NyaXB0aW9uOiBUaGlzIHdpemFyZCB3aWxsIGd1aWRlIHlvdSBvbiBob3cgdG8gdGVybWluYXRlIEVDMiBpbnN0YW5jZSBpbiB0aGUgQW1hem9uIGNsb3VkCiAgbmFtZXNwYWNlOiBkZWZhdWx0CiAgdGFnczoKICAgIC0gYWFwLW9wZXJhdGlvbnMKICAgIC0gaW50ZXJtZWRpYXRlCiAgICAtIGNsb3VkLWF3cy1vcHMKICAgIC0gY29uZmlndXJlLWVjMi1wYXR0ZXJuCiAgICAtIHRlcm1pbmF0ZS1lYzItaW5zdGFuY2UKc3BlYzoKICB0eXBlOiBzZXJ2aWNlCiAgcGFyYW1ldGVyczoKICAgIC0gdGl0bGU6IFByb21wdHMKICAgICAgZGVzY3JpcHRpb246IFRlcm1pbmF0ZSBFQzIgaW5zdGFuY2UgaW4gdGhlIEFtYXpvbiBjbG91ZAogICAgICByZXF1aXJlZDoKICAgICAgICAtIHRva2VuCiAgICAgICAgLSBpbnZlbnRvcnkKICAgICAgcHJvcGVydGllczoKICAgICAgICB0b2tlbjoKICAgICAgICAgIHRpdGxlOiBUb2tlbgogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICBkZXNjcmlwdGlvbjogT2F1dGgyIHRva2VuCiAgICAgICAgICB1aTpmaWVsZDogQUFQVG9rZW5GaWVsZAogICAgICAgICAgdWk6d2lkZ2V0OiBwYXNzd29yZAogICAgICAgICAgdWk6YmFja3N0YWdlOgogICAgICAgICAgICByZXZpZXc6CiAgICAgICAgICAgICAgc2hvdzogZmFsc2UKICAgICAgICBpbnZlbnRvcnk6CiAgICAgICAgICB0aXRsZTogSW52ZW50b3J5CiAgICAgICAgICBkZXNjcmlwdGlvbjogUGxlYXNlIGVudGVyIHRoZSBpbnZlbnRvcnkgeW91IHdhbnQgdG8gdXNlIHRoZSBzZXJ2aWNlcyBvbgogICAgICAgICAgcmVzb3VyY2U6IGludmVudG9yaWVzCiAgICAgICAgICB1aTpmaWVsZDogQUFQUmVzb3VyY2VQaWNrZXIKICAgICAgICBjcmVkZW50aWFsczoKICAgICAgICAgIHRpdGxlOiBDcmVkZW50aWFscwogICAgICAgICAgZGVzY3JpcHRpb246IFNlbGVjdCBjcmVkZW50aWFscyBmb3IgYWNjZXNzaW5nIEFXUy4KICAgICAgICAgICAgVGhlIGNyZWRlbnRpYWxzIG5lZWQgdG8gYmUgb2YgdHlwZSAiQW1hem9uIFdlYiBTZXJ2aWNlcyIuCiAgICAgICAgICB0eXBlOiBhcnJheQogICAgICAgICAgdWk6ZmllbGQ6IEFBUFJlc291cmNlUGlja2VyCiAgICAgICAgICByZXNvdXJjZTogY3JlZGVudGlhbHMKICAgICAgICB2ZXJib3NpdHk6CiAgICAgICAgICB0aXRsZTogVmVyYm9zaXR5CiAgICAgICAgICBkZXNjcmlwdGlvbjogQ29udHJvbCB0aGUgbGV2ZWwgb2Ygb3V0cHV0IEFuc2libGUgd2lsbCBwcm9kdWNlIGFzIHRoZSBwbGF5Ym9vayBleGVjdXRlcy4KICAgICAgICAgIHJlc291cmNlOiB2ZXJib3NpdHkKICAgICAgICAgIHVpOmZpZWxkOiBBQVBSZXNvdXJjZVBpY2tlcgogICAgLSB0aXRsZTogU3VydmV5CiAgICAgIHJlcXVpcmVkOgogICAgICAgIC0gYXdzX3JlZ2lvbgogICAgICAgIC0gaW5zdGFuY2VfbmFtZQogICAgICBkZXNjcmlwdGlvbjogVGVybWluYXRlIEVDMiBpbnN0YW5jZSBpbiB0aGUgQW1hem9uIGNsb3VkCiAgICAgIHByb3BlcnRpZXM6CiAgICAgICAgYXdzX3JlZ2lvbjoKICAgICAgICAgIHRpdGxlOiBBV1MgUmVnaW9uCiAgICAgICAgICBkZXNjcmlwdGlvbjogQVdTIHJlZ2lvbiB3aGVyZSByZXNvdXJjZXMgc2hvdWxkIGJlIGRlbGV0ZWQKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgIGluc3RhbmNlX25hbWU6CiAgICAgICAgICB0aXRsZTogSW5zdGFuY2UgTmFtZQogICAgICAgICAgZGVzY3JpcHRpb246IE5hbWUgb2YgRUMyIGluc3RhbmNlIHRvIGRlbGV0ZQogICAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgICAgICB1aTpvcHRpb25zOgogICAgICAgICAgICByb3dzOiA1CiAgICAgICAga2V5X25hbWU6CiAgICAgICAgICB0aXRsZTogS2V5IFBhaXIgTmFtZQogICAgICAgICAgZGVzY3JpcHRpb246IE5hbWUgb2Yga2V5IHBhaXIgdG8gZGVsZXRlIGZvciBTU0ggYWNjZXNzIHRvIHRoZSBFQzIgaW5zdGFuY2UuIERlZmF1bHRzIHRvICd7eyBpbnN0YW5jZV9uYW1lIH19LWtleScKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogICAgICAgIHZwY19uYW1lOgogICAgICAgICAgdGl0bGU6IFZQQyBOYW1lCiAgICAgICAgICBkZXNjcmlwdGlvbjogTmFtZSBvZiB0aGUgVlBDIHRvIGRlbGV0ZS4gRGVmYXVsdHMgdG8gJ3t7aW5zdGFuY2VfbmFtZX19LXZwYycKICAgICAgICAgIHR5cGU6IHN0cmluZwogICAgICAgICAgdWk6b3B0aW9uczoKICAgICAgICAgICAgcm93czogNQogIHN0ZXBzOgogICAgLSBpZDogbGF1bmNoLWpvYgogICAgICBuYW1lOiBMYXVuY2ggQVdTIE9wZXJhdGlvbnMgLyBUZXJtaW5hdGUgRUMyIEluc3RhbmNlCiAgICAgIGFjdGlvbjogcmhhYXA6bGF1bmNoLWpvYi10ZW1wbGF0ZQogICAgICBpbnB1dDoKICAgICAgICB0b2tlbjogJHt7IHBhcmFtZXRlcnMudG9rZW4gfX0KICAgICAgICB2YWx1ZXM6CiAgICAgICAgICBpbnZlbnRvcnk6ICR7eyBwYXJhbWV0ZXJzLmludmVudG9yeSAgfX0KICAgICAgICAgIGNyZWRlbnRpYWxzOiAke3sgcGFyYW1ldGVycy5jcmVkZW50aWFscyB9fQogICAgICAgICAgdmVyYm9zaXR5OiAke3twYXJhbWV0ZXJzLnZlcmJvc2l0eX19CiAgICAgICAgICBleHRyYVZhcmlhYmxlczoKICAgICAgICAgICAgYXdzX3JlZ2lvbjogJHt7IHBhcmFtZXRlcnMuYXdzX3JlZ2lvbiAgfX0KICAgICAgICAgICAgaW5zdGFuY2VfbmFtZTogJHt7IHBhcmFtZXRlcnMuaW5zdGFuY2VfbmFtZSAgfX0KICAgICAgICAgICAga2V5X25hbWU6ICR7eyBwYXJhbWV0ZXJzLmtleV9uYW1lICB9fQogICAgICAgICAgICB2cGNfbmFtZTogJHt7IHBhcmFtZXRlcnMudnBjX25hbWUgIH19CiAgb3V0cHV0OgogICAgdGV4dDoKICAgICAgLSB0aXRsZTogQVdTIE9wZXJhdGlvbnMgLyBUZXJtaW5hdGUgRUMyIEluc3RhbmNlIHRlbXBsYXRlIGV4ZWN1dGVkCiAgICAgICAgICBzdWNjZXNzZnVsbHkKICAgICAgICBjb250ZW50OiB8CiAgICAgICAgICAqKkpvYiBJRDoqKiAke3sgc3RlcHNbJ2xhdW5jaC1qb2InXS5vdXRwdXQuZGF0YS5pZCB9fQogICAgICAgICAgKipKb2IgU1RBVFVTOioqICR7eyBzdGVwc1snbGF1bmNoLWpvYiddLm91dHB1dC5kYXRhLnN0YXR1cyB9fQogICAgbGlua3M6CiAgICAgIC0gdGl0bGU6IFZpZXcgaW4gUkggQUFQCiAgICAgICAgdXJsOiAke3sgc3RlcHNbJ2xhdW5jaC1qb2InXS5vdXRwdXQuZGF0YS51cmwgfX0=',
          }),
        );
      },
    ),
    http.get(
      'https://api.github.com/repos/testUser/testRepo',
      // @ts-ignore
      (req, res, ctx) => {
        return res(ctx.status(404));
      },
    ),
    http.get(
      'https://api.github.com/repos/devUser/devRepo',
      // @ts-ignore
      (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json({
            id: 12345,
            default_branch: 'main',
          }),
        );
      },
    ),
    http.head(
      'https://api.github.com/repos/testOwner/existingRepo',
      // @ts-ignore
      () => {
        return HttpResponse.json({}, { status: 200 });
      },
    ),
    http.head(
      'https://api.github.com/repos/testOwner/nonExistentRepo',
      // @ts-ignore
      () => {
        return HttpResponse.json({}, { status: 404 });
      },
    ),
  ];

  const server = setupServer(...handlers);

  // @ts-ignore
  let useCaseMaker: any;

  beforeEach(() => {
    jest.resetAllMocks();
  });
  beforeAll(() => server.listen());

  afterAll(() => server.close());

  it('makeTemplates - error', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });
    jest
      .spyOn(AAPClient.prototype, 'getJobTemplatesByName')
      .mockImplementation(
        (templateNames: string[], _organization: Organization) => {
          expect(templateNames).toHaveLength(1);
          let id = 1;
          if (templateNames[0] === 'AWS Operations / Terminate EC2 Instance') {
            id = 2;
          }
          return Promise.resolve([{ id: id, name: templateNames[0] }]);
        },
      );
    await expect(useCaseMaker.makeTemplates()).rejects.toThrow(
      'Error checking if github repo testRepo exists.',
    );
  });

  it('makeTemplates - writeLocally', async () => {
    config = new ConfigReader(MOCK_CONFIG.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });
    jest
      .spyOn(AAPClient.prototype, 'getJobTemplatesByName')
      .mockImplementation(
        (templateNames: string[], _organization: Organization) => {
          expect(templateNames).toHaveLength(1);
          let id = 1;
          if (templateNames[0] === 'AWS Operations / Terminate EC2 Instance') {
            id = 2;
          }
          return Promise.resolve([{ id: id, name: templateNames[0] }]);
        },
      );
    await useCaseMaker.makeTemplates();
    const dirPath = MOCK_CONFIG.data.ansible.rhaap.showCaseLocation.target;
    const isDirExist = await fs.promises
      .access(dirPath)
      .then(() => true)
      .catch(() => false);

    expect(isDirExist).toBe(true);

    const isTemplateDirExist = await fs.promises
      .access(`${dirPath}/templates`)
      .then(() => true)
      .catch(() => false);

    expect(isTemplateDirExist).toBe(true);
    await fs.promises.rm(dirPath, {
      recursive: true,
      force: true,
    });
  });

  it('should throw an error if the repository URL is invalid', async () => {
    const invalidOptions = {
      value: 'devfile content',
      repositoryUrl: 'https://github.com/invalid-url', // Invalid URL
    };
    config = new ConfigReader(MOCK_CONFIG.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    // Call the method and assert that it throws the expected error for invalid URL
    await expect(
      useCaseMaker.devfilePushToGithub(invalidOptions),
    ).rejects.toThrow('Invalid repository URL');

    const validOptions = {
      value: 'devfile content',
      repositoryUrl: 'https://github.com/devUser/devRepo',
    };
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });
    await expect(
      useCaseMaker.devfilePushToGithub(validOptions),
    ).rejects.toThrow("Cannot read properties of undefined (reading 'status')");
  });

  it('generateRepositoryUrl - should generate correct GitHub URL', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const url = await useCaseMaker.generateRepositoryUrl({
      repoOwner: 'testOwner',
      repoName: 'testRepo',
    });

    expect(url).toBe('github.com?repo=testRepo&owner=testOwner');
  });

  it('checkIfRepositoryExists - should return true when repository exists', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const exists = await useCaseMaker.checkIfRepositoryExists({
      repoOwner: 'testOwner',
      repoName: 'existingRepo',
    });

    expect(exists).toBe(true);
  });

  it('checkIfRepositoryExists - should return false when repository does not exist', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const exists = await useCaseMaker.checkIfRepositoryExists({
      repoOwner: 'testOwner',
      repoName: 'nonExistentRepo',
    });

    expect(exists).toBe(false);
  });

  it('checkIfRepositoryExists - should throw error for non-404 errors', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    // Add a handler that returns 500 error
    server.use(
      http.head(
        'https://api.github.com/repos/testOwner/testRepo',
        // @ts-ignore
        () => {
          return HttpResponse.json({}, { status: 500 });
        },
      ),
    );

    await expect(
      useCaseMaker.checkIfRepositoryExists({
        repoOwner: 'testOwner',
        repoName: 'testRepo',
      }),
    ).rejects.toThrow(
      'Error checking if Github Repository testOwner/testRepo exists',
    );
  });
});

describe('ansible-aap:useCaseMaker:gitlab', () => {
  let config;
  let ansibleConfig: any;
  const MOCK_CONF = {
    data: {
      integrations: {
        gitlab: [
          {
            host: 'gitlab.com',
            token: 'mockGitlabPAT',
          },
        ],
      },
      ansible: {
        rhaap: {
          baseUrl: 'https://rhaap.test',
          token: MOCK_TOKEN,
          checkSSL: false,
          showCaseLocation: {
            type: 'url',
            target: 'https://gitlab.com/testUser/testRepo',
            gitBranch: 'main',
            gitUser: 'testUser',
            gitEmail: 'username@example.com',
          },
        },
      },
    },
  };
  const logger = mockServices.logger.mock();
  const organization = MOCK_ORGANIZATION;
  const scmType = 'Gitlab';
  const useCases = [
    {
      name: 'Cloud',
      version: 'main',
      url: 'https://gitlab.com/userName/repoName',
    },
  ] as UseCase[];

  const handlers = [
    http.get(
      'https://gitlab.com/api/v4/projects/testUser%2FtestRepo/repository/branches',
      () => {
        return HttpResponse.json([
          { name: 'main', commit: { id: 'abc123' } },
          { name: 'develop', commit: { id: 'def456' } },
        ]);
      },
    ),
    http.get('https://gitlab.com/api/v4/projects/testUser%2FtestRepo', () => {
      return HttpResponse.json({ id: 12345, default_branch: 'main' });
    }),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/tree',
      () => {
        return HttpResponse.json([
          { path: 'extensions/patterns', type: 'tree', name: 'patterns' },
        ]);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/tree?path=extensions%2Fpatterns',
      () => {
        return HttpResponse.json([
          {
            path: 'extensions/patterns/test_folder',
            type: 'tree',
            name: 'test_folder',
          },
        ]);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/tree?path=extensions%2Fpatterns%2Ftest_folder',
      () => {
        return HttpResponse.json([
          {
            path: 'extensions/patterns/test_folder/setup.yml',
            type: 'blob',
            name: 'setup.yml',
          },
          {
            path: 'extensions/patterns/test_folder/template_rhdh',
            type: 'tree',
            name: 'template_rhdh',
          },
        ]);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/files/extensions%2Fpatterns%2Ftest_folder%2Fsetup.yml/raw',
      () => {
        return HttpResponse.text(`
controller_labels:
  - name: cloud.aws_ops
    organization: "{{ organization | default('Default') }}"
  - name: configure_ec2_pattern
    organization: "{{ organization | default('Default') }}"
  - name: create_ec2_instance
    organization: "{{ organization | default('Default') }}"
  - name: terminate_ec2_instance
    organization: "{{ organization | default('Default') }}"

controller_templates:
  - name: AWS Operations / Create EC2 Instance
    description: This job template creates an EC2 instance and associated networking resources.
    ask_inventory_on_launch: true
    ask_credential_on_launch: true
    ask_verbosity_on_launch: true
    execution_environment: AWS Operations / Configure EC2 Instance Pattern Execution Environment
    project: AWS Operations / Configure EC2 Instance Pattern Project
    playbook: extensions/patterns/configure_ec2/playbooks/create_ec2_instance.yml
    job_type: run
    organization: "{{ organization | default('Default') }}"
    labels:
      - cloud.aws_ops
      - configure_ec2_pattern
      - create_ec2_instance
    survey_enabled: true
    survey_spec: "{{ lookup('file', pattern.path.replace('setup.yml', '') + 'template_surveys/create_ec2_instance.yml') | from_yaml }}"

  - name: AWS Operations / Terminate EC2 Instance
    description: This job template terminates an EC2 instance and its associated networking resources.
    ask_inventory_on_launch: true
    ask_credential_on_launch: true
    ask_verbosity_on_launch: true
    execution_environment: AWS Operations / Configure EC2 Instance Pattern Execution Environment
    project: AWS Operations / Configure EC2 Instance Pattern Project
    playbook: extensions/patterns/configure_ec2/playbooks/terminate_ec2_instance.yml
    job_type: run
    organization: "{{ organization | default('Default') }}"
    labels:
      - cloud.aws_ops
      - configure_ec2_pattern
      - terminate_ec2_instance
    survey_enabled: true
    survey_spec: "{{ lookup('file', pattern.path.replace('setup.yml', '') + 'template_surveys/terminate_ec2_instance.yml') | from_yaml }}"
      `);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/tree?path=extensions%2Fpatterns%2Ftest_folder%2Ftemplate_rhdh',
      () => {
        return HttpResponse.json([
          {
            path: 'extensions/patterns/test_folder/template_rhdh/create_ec2_instance.yml',
            type: 'blob',
            name: 'create_ec2_instance.yml',
          },
          {
            path: 'extensions/patterns/test_folder/template_rhdh/terminate_ec2_instance.yml',
            type: 'blob',
            name: 'terminate_ec2_instance.yml',
          },
        ]);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/files/extensions%2Fpatterns%2Ftest_folder%2Ftemplate_rhdh%2Fcreate_ec2_instance.yml/raw',
      () => {
        return HttpResponse.text(`
apiVersion: scaffolder.backstage.io/v1beta1
kind: Template
metadata:
  name: cloud-configure-ec2
  title: AWS Operations / Create EC2 Instance
  description: This wizard will guide you on how to create EC2 instance in the Amazon cloud
  namespace: default
  tags:
    - aap-operations
    - intermediate
    - cloud-aws-ops
    - configure-ec2-pattern
    - create-ec2-instance
spec:
  type: service
  parameters: []
  steps: []
      `);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/userName%2FrepoName/repository/files/extensions%2Fpatterns%2Ftest_folder%2Ftemplate_rhdh%2Fterminate_ec2_instance.yml/raw',
      () => {
        return HttpResponse.text(`
apiVersion: scaffolder.backstage.io/v1beta1
kind: Template
metadata:
  name: cloud-terminate-ec2
  title: AWS Operations / Terminate EC2 Instance
  description: This wizard will guide you on how to terminate EC2 instance in the Amazon cloud
  namespace: default
  tags:
    - aap-operations
    - intermediate
    - cloud-aws-ops
    - configure-ec2-pattern
    - terminate-ec2-instance
spec:
  type: service
  parameters: []
  steps: []
      `);
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/testOwner%2FexistingRepo',
      () => {
        return HttpResponse.json({ id: 12345 }, { status: 200 });
      },
    ),
    http.get(
      'https://gitlab.com/api/v4/projects/testOwner%2FnonExistentRepo',
      () => {
        return HttpResponse.json({}, { status: 404 });
      },
    ),
  ];

  const server = setupServer(...handlers);

  let useCaseMaker: any;
  const mockGit = require('isomorphic-git');

  beforeEach(() => {
    jest.resetAllMocks();
    mockGit.init.mockClear();
    mockGit.clone.mockClear();
    mockGit.fetch.mockClear();
    mockGit.checkout.mockClear();
    mockGit.createAndCheckout.mockClear();
    mockGit.checkoutOrCreate.mockClear();
    mockGit.commitAndPush.mockClear();
    mockGit.add.mockClear();
    mockGit.commit.mockClear();
    mockGit.push.mockClear();
  });

  beforeAll(() => server.listen());

  afterAll(() => server.close());

  it('makeTemplates - writeLocally for GitLab', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });
    jest
      .spyOn(AAPClient.prototype, 'getJobTemplatesByName')
      .mockImplementation(
        (templateNames: string[], _organization: Organization) => {
          expect(templateNames).toHaveLength(1);
          let id = 1;
          if (templateNames[0] === 'AWS Operations / Terminate EC2 Instance') {
            id = 2;
          }
          return Promise.resolve([{ id: id, name: templateNames[0] }]);
        },
      );

    await useCaseMaker.makeTemplates();
    expect(mockGit.init).toHaveBeenCalled();
    expect(mockGit.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: expect.any(String),
      }),
    );
  });

  it('makeTemplates - createGitLabContent', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });
    jest
      .spyOn(AAPClient.prototype, 'getJobTemplatesByName')
      .mockImplementation(
        (templateNames: string[], _organization: Organization) => {
          expect(templateNames).toHaveLength(1);
          let id = 1;
          if (templateNames[0] === 'AWS Operations / Terminate EC2 Instance') {
            id = 2;
          }
          return Promise.resolve([{ id: id, name: templateNames[0] }]);
        },
      );

    await useCaseMaker.makeTemplates();

    expect(mockGit.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: expect.any(String),
      }),
    );
  });

  it('makeTemplates - getGitLabTemplatesLocation', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });

    const locations = await useCaseMaker.getGitLabTemplatesLocation({
      userName: 'userName',
      repoName: 'repoName',
      branch: 'main',
    });

    expect(locations).toBeDefined();
    expect(locations.length).toBeGreaterThanOrEqual(0);
  });

  it('makeTemplates - fetchGitLabData error handling', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    const token = MOCK_TOKEN;
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token,
    });

    const result = await useCaseMaker.fetchGitLabData({
      url: 'invalid-url',
    });

    expect(result).toBeNull();
  });

  it('should throw an error if it fails to fetch repository details', async () => {
    const invalidOptions = {
      value: 'devfile content',
      repositoryUrl: 'https://gitlab.com/invalid-url',
    };
    config = new ConfigReader(MOCK_CONFIG.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    await expect(
      useCaseMaker.devfilePushToGitLab(invalidOptions),
    ).rejects.toThrow('Invalid repository URL');

    const validOptions = {
      value: 'devfile content',
      repositoryUrl: 'https://gitlab.com/devUser/devRepo',
    };
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });
    await expect(
      useCaseMaker.devfilePushToGitLab(validOptions),
    ).rejects.toThrow('Failed to fetch repository details: Unauthorized');
  });

  it('generateRepositoryUrl - should generate correct GitLab URL', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const url = await useCaseMaker.generateRepositoryUrl({
      repoOwner: 'testOwner',
      repoName: 'testRepo',
    });

    expect(url).toBe('gitlab.com?repo=testRepo&owner=testOwner');
  });

  it('checkIfRepositoryExists - should return true when GitLab repository exists', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const exists = await useCaseMaker.checkIfRepositoryExists({
      repoOwner: 'testOwner',
      repoName: 'existingRepo',
    });

    expect(exists).toBe(true);
  });

  it('checkIfRepositoryExists - should return false when GitLab repository does not exist', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const exists = await useCaseMaker.checkIfRepositoryExists({
      repoOwner: 'testOwner',
      repoName: 'nonExistentRepo',
    });

    expect(exists).toBe(false);
  });

  it('checkIfRepositoryExists - should throw error for non-404 GitLab errors', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    // Mock fetch to throw an error (simulating network error)
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Server error'));

    await expect(
      useCaseMaker.checkIfRepositoryExists({
        repoOwner: 'testOwner',
        repoName: 'testRepo',
      }),
    ).rejects.toThrow(
      'Error checking if Gitlab Repository testOwner/testRepo exists: Server error',
    );

    // Restore original fetch
    global.fetch = originalFetch;
  });

  it('fetchGitlabFileContent - should successfully fetch file content from GitLab', async () => {
    const fileContent = '# Test File\n\nThis is a test file content.';
    server.use(
      http.get(
        'https://gitlab.com/testOwner/testRepo/-/raw/main/path/to/file.md',
        () => {
          return HttpResponse.text(fileContent);
        },
      ),
    );

    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const content = await useCaseMaker.fetchGitlabFileContent({
      owner: 'testOwner',
      repo: 'testRepo',
      filePath: 'path/to/file.md',
      branch: 'main',
    });

    expect(content).toBe(fileContent);
  });

  it('fetchGitlabFileContent - should throw error when GitLab host is not configured', async () => {
    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    // Directly set scmIntegration to an object without host to test the error case
    useCaseMaker.scmIntegration = {
      token: 'mockToken',
      // host is missing
    } as any;

    await expect(
      useCaseMaker.fetchGitlabFileContent({
        owner: 'testOwner',
        repo: 'testRepo',
        filePath: 'path/to/file.md',
        branch: 'main',
      }),
    ).rejects.toThrow('Not Gitlab host configured.');
  });

  it('fetchGitlabFileContent - should handle fetch errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    await expect(
      useCaseMaker.fetchGitlabFileContent({
        owner: 'testOwner',
        repo: 'testRepo',
        filePath: 'path/to/file.md',
        branch: 'main',
      }),
    ).rejects.toThrow('Error fetching file content: Failed to fetch');

    global.fetch = originalFetch;
  });

  it('fetchGitlabFileContent - should work without token', async () => {
    const fileContent = '# Test File\n\nThis is a test file content.';
    const MOCK_CONF_NO_TOKEN = {
      data: {
        ...MOCK_CONF.data,
        integrations: {
          gitlab: [
            {
              host: 'gitlab.com',
              // No token
            },
          ],
        },
      },
    };

    server.use(
      http.get(
        'https://gitlab.com/testOwner/testRepo/-/raw/main/path/to/file.md',
        () => {
          return HttpResponse.text(fileContent);
        },
      ),
    );

    config = new ConfigReader(MOCK_CONF_NO_TOKEN.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    const content = await useCaseMaker.fetchGitlabFileContent({
      owner: 'testOwner',
      repo: 'testRepo',
      filePath: 'path/to/file.md',
      branch: 'main',
    });

    expect(content).toBe(fileContent);
  });

  it('fetchGitlabFileContent - should handle network errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    config = new ConfigReader(MOCK_CONF.data);
    ansibleConfig = getAnsibleConfig(config);
    useCaseMaker = new UseCaseMaker({
      ansibleConfig,
      logger,
      organization,
      scmType,
      apiClient: mockAnsibleService,
      useCases,
      token: MOCK_TOKEN,
    });

    await expect(
      useCaseMaker.fetchGitlabFileContent({
        owner: 'testOwner',
        repo: 'testRepo',
        filePath: 'path/to/file.md',
        branch: 'main',
      }),
    ).rejects.toThrow('Error fetching file content: Network error');

    global.fetch = originalFetch;
  });
});
