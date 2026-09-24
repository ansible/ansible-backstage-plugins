/*
 * Copyright Red Hat
 */

import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { GitHubRepoUrlFieldExtension as GitHubRepoUrlFieldExtensionComponent } from './GitHubRepoUrlFieldExtension';
import { GitHubRepoUrlFieldFieldSchema } from './schema';
import { githubRepoUrlValidation } from './validation';

export { githubRepoUrlValidation } from './validation';

export const GitHubRepoUrlFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GitHubRepoUrlField',
    component: GitHubRepoUrlFieldExtensionComponent,
    validation: githubRepoUrlValidation,
    schema: GitHubRepoUrlFieldFieldSchema,
  }),
);
