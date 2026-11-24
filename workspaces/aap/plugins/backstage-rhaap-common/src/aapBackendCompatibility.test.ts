import * as backend from '@ansible/aap-backend';
import * as node from '@ansible/aap-node';
import * as legacyClient from './AAPClient';
import * as legacyService from './AAPService';

it('forwards the existing client, fixtures and configuration exports without duplicating them', () => {
  for (const key of [
    'AAPClient',
    'mockJobTemplateResponse',
    'mockSurveyResponse',
    'getAnsibleConfig',
    'getCatalogConfig',
    'resolveActiveOrganizations',
    'findMissingConfiguredOrganizations',
  ] as const) {
    expect(legacyClient[key]).toBe(node[key]);
  }
});

it('keeps both factories on the existing service reference', () => {
  expect(legacyService.ansibleServiceFactory.service).toBe(
    node.ansibleServiceRef,
  );
  expect(backend.ansibleServiceFactory.service).toBe(node.ansibleServiceRef);
  expect(legacyService.ansibleServiceRef).toBe(node.ansibleServiceRef);
  expect(backend.default).toBe(backend.ansibleServiceFactory);
});
