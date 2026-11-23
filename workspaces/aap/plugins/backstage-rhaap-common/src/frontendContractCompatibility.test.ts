import * as legacyExtensions from './gitRepositoriesExtensions';
import * as sdkExtensions from '@ansible/portal-extension-api/gitRepositoriesExtensions';
import * as legacyCatalog from './gitRepositoriesCatalog';
import * as sdkCatalog from '@ansible/portal-extension-api/gitRepositoriesCatalog';
import { SCM_INTEGRATION_AUTH_FAILED_CODE as legacyScmCode } from './constants';
import { gitRepositoriesViewPermission as legacyPermission } from './permissions';
import {
  SCM_INTEGRATION_AUTH_FAILED_CODE,
  gitRepositoriesViewPermission,
} from '@ansible/portal-extension-common';

it('forwards frontend API objects without creating another reference or default', () => {
  expect(legacyExtensions.gitRepositoriesExtensionsApiRef).toBe(
    sdkExtensions.gitRepositoriesExtensionsApiRef,
  );
  expect(legacyExtensions.DefaultGitRepositoriesExtensionsApi).toBe(
    sdkExtensions.DefaultGitRepositoriesExtensionsApi,
  );
  expect(legacyExtensions.defaultGitRepositoriesExtensionsApiFactory).toBe(
    sdkExtensions.defaultGitRepositoriesExtensionsApiFactory,
  );
  expect(legacyCatalog.gitRepositoriesCatalogApiRef).toBe(
    sdkCatalog.gitRepositoriesCatalogApiRef,
  );
  expect(legacyCatalog.DefaultGitRepositoriesCatalogApi).toBe(
    sdkCatalog.DefaultGitRepositoriesCatalogApi,
  );
  expect(legacyCatalog.defaultGitRepositoriesCatalogApiFactory).toBe(
    sdkCatalog.defaultGitRepositoriesCatalogApiFactory,
  );
});

it('preserves the shared permission identity, shape and SCM error code', () => {
  expect(legacyPermission).toBe(gitRepositoriesViewPermission);
  expect(legacyPermission).toEqual({
    type: 'basic',
    name: 'ansible.git-repositories.view',
    attributes: {},
  });
  expect(legacyScmCode).toBe(SCM_INTEGRATION_AUTH_FAILED_CODE);
  expect(SCM_INTEGRATION_AUTH_FAILED_CODE).toBe('INTEGRATION_AUTH_FAILED');
});
