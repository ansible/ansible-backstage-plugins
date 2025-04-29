/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CatalogApi } from '@backstage/plugin-catalog-react';

export const mockCatalogApi: jest.Mocked<CatalogApi> = {
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  queryEntities: jest.fn(),
  getEntityFacets: jest.fn(),
  getEntityByRef: jest.fn().mockImplementation(() =>
    Promise.resolve({
      metadata: {
        annotations: {
          'backstage.io/managed-by-location':
            'url:https://github.com//tree/update-urls/generic-seed/template.yaml',
          'backstage.io/managed-by-origin-location':
            'url:https://github.com//blob/update-urls/seed.yaml',
          'backstage.io/view-url':
            'https://github.com//tree/update-urls/generic-seed/template.yaml',
          'backstage.io/edit-url':
            'https://github.com//edit/update-urls/generic-seed/template.yaml',
          'backstage.io/source-location':
            'url:https://github.com//tree/update-urls/generic-seed/',
        },
        name: 'generic-seed',
        title: 'Create wizard use cases',
        description:
          'Use this template to create actual wizard use case templates',
        namespace: 'default',
        tags: ['aap-operations', 'intermediate'],
        uid: '4235f4ae-a596-4ed4-9973-6872eb85971e',
        etag: 'e0138197d283e66c37b74bf0d1e355fcd481fa8f',
      },
      apiVersion: 'scaffolder.backstage.io/v1beta3',
      kind: 'Template',
      spec: {
        owner: 'RedHat',
        type: 'service',
        parameters: [
          {
            title: 'Project data',
            description: 'Provide project data',
            required: ['token', 'organization', 'scmUrl'],
            properties: {
              token: {
                title: 'Token',
                type: 'string',
                description: 'Oauth2 token',
                'ui:field': 'AAPTokenField',
                'ui:backstage': {
                  review: {
                    show: false,
                  },
                },
              },
              organization: {
                title: 'Organization',
                description: 'Select organization',
                resource: 'organizations',
                'ui:field': 'AAPResourcePicker',
                default: {
                  id: 1,
                  name: 'Default',
                },
              },
              jobInventory: {
                title: 'Inventory',
                description: 'Select inventory',
                resource: 'inventories',
                'ui:field': 'AAPResourcePicker',
                default: {
                  id: 1,
                  name: 'Default',
                },
              },
              scmUrl: {
                title: 'Source control URL',
                type: 'string',
                'ui:help': 'Source control URL: gitSourceControlUrlHelp',
                'ui:options': {
                  rows: 5,
                },
                default: 'https://github.com/ansible/ansible-pattern-loader',
              },
              scmBranch: {
                title: 'Source control branch/tag/commit',
                type: 'string',
                'ui:options': {
                  rows: 5,
                },
                default: 'main',
                'ui:help':
                  'Branch to checkout. In addition to branches, you can input tags, commit hashes, and arbitrary refs. Some commit hashes and refs may not be available unless you also provide a custom refspec.',
              },
            },
          },
          {
            title: 'Template data',
            description: 'Provide template data',
            required: [
              'token',
              'useCases',
              'playbook',
              'aapHostName',
              'aapUserName',
              'aapPassword',
            ],
            properties: {
              token: {
                title: 'Token',
                type: 'string',
                description: 'Oauth2 token',
                'ui:field': 'AAPTokenField',
                'ui:backstage': {
                  review: {
                    show: false,
                  },
                },
              },
              useCases: {
                title: 'Use cases',
                type: 'array',
                items: {
                  type: 'object',
                  enum: [
                    {
                      name: 'rhel',
                      url: 'https://github.com/justinc1/experience_demo',
                      version: 'feature-service-aae',
                    },
                    {
                      name: 'network',
                      url: 'https://github.com/rohitthakur2590/network.backup',
                      version: 'main',
                    },
                    {
                      name: 'windows',
                      url: 'https://github.com/redhat-cop/infra.windows_ops',
                      version: 'main',
                    },
                  ],
                  enumNames: ['Rhel', 'Network', 'Windows'],
                },
                uniqueItems: true,
                'ui:widget': 'checkboxes',
              },
              playbook: {
                title: 'Playbook',
                description: 'Select playbook',
                type: 'string',
                'ui:options': {
                  rows: 5,
                },
                default: 'seed_portal_content.yml',
              },
              aapHostName: {
                title: 'AAP URL',
                type: 'string',
                'ui:options': {
                  rows: 5,
                },
              },
              aapUserName: {
                title: 'AAP username',
                type: 'string',
                'ui:options': {
                  rows: 5,
                },
                default: 'admin',
              },
              aapPassword: {
                title: 'AAP password',
                type: 'string',
                'ui:field': 'Secret',
                'ui:options': {
                  rows: 5,
                },
              },
              aapValidateCerts: {
                title: 'AAP validate certs',
                type: 'boolean',
                default: false,
              },
            },
          },
        ],
        steps: [
          {
            id: 'create-project',
            name: 'Create project',
            action: 'rhaap:create-project',
            input: {
              token: '${{ parameters.token }}',
              deleteIfExist: true,
              values: {
                projectName: 'RH AAP Demo Seed Job Template Project',
                projectDescription: 'RH AAP Demo Seed Job Template Project',
                organization: '${{ parameters.organization }}',
                scmUrl: '${{ parameters.scmUrl }}',
                scmBranch: '${{ parameters.scmBranch }}',
                scmUpdateOnLaunch: true,
              },
            },
          },
          {
            id: 'create-ee',
            name: 'Create execution environment',
            action: 'rhaap:create-execution-environment',
            input: {
              token: '${{ parameters.token }}',
              deleteIfExist: true,
              values: {
                environmentName:
                  'RH AAP Demo Seed Job Template execution environment',
                organization: '${{ parameters.organization }}',
                image: 'quay.io/justinc1_github/apd-ee-25-seedseed:latest',
                pull: 'always',
              },
            },
          },
          {
            id: 'create-template',
            name: 'Create job template',
            action: 'rhaap:create-job-template',
            input: {
              token: '${{ parameters.token }}',
              deleteIfExist: true,
              values: {
                templateName: 'RH AAP Demo Seed Job Template',
                templateDescription: 'RH AAP Demo Seed Job Template',
                project: "${{steps['create-project'].output.project }}",
                organization: '${{ parameters.organization }}',
                jobInventory: '${{ parameters.jobInventory }}',
                playbook: '${{ parameters.playbook }}',
                executionEnvironment:
                  "${{steps['create-ee'].output.executionEnvironment }}",
                extraVariables: {
                  aap_hostname: '${{ parameters.aapHostName }}',
                  aap_username: '${{ parameters.aapUserName }}',
                  aap_password: '${{ secrets.aapPassword }}',
                  aap_validate_certs: '${{ parameters.aapValidateCerts }}',
                  usecases: '${{ parameters.useCases }}',
                  seed_usecase:
                    '${{ parameters.useCases | useCaseNameFilter }}',
                  organization_name:
                    "${{ parameters.organization | resourceFilter('name')}}",
                },
              },
            },
          },
          {
            id: 'launch-job',
            name: 'Launch job template',
            action: 'rhaap:launch-job-template',
            input: {
              token: '${{ parameters.token }}',
              values: {
                templateID: "${{steps['create-template'].output.template.id }}",
              },
            },
          },
          {
            id: 'clean-up',
            name: 'Clean up',
            action: 'rhaap:clean-up',
            input: {
              token: '${{ parameters.token }}',
              values: {
                project: "${{steps['create-project'].output.project }}",
                executionEnvironment:
                  "${{steps['create-ee'].output.executionEnvironment }}",
                template: "${{steps['create-template'].output.template }}",
              },
            },
          },
          {
            id: 'create-showcase',
            name: 'Create showcases',
            action: 'rhaap:create-show-cases',
            input: {
              token: '${{ parameters.token }}',
              values: {
                organization: '${{ parameters.organization }}',
                templateNames: [
                  'RHEL / Configure Services',
                  'RHEL / Update RHEL Time Servers',
                  'Network Operations / Create Full Network Backup',
                  'Network Operations / Restore Config',
                  'Windows Operations / Create IIS',
                  'Windows Operations / Delete IIS',
                ],
              },
            },
          },
        ],
        output: {
          text: [
            {
              title: 'Job generic seed template executed successfully',
              content:
                "**Job ID:** `${{ steps['launch-job'].output.data.id }}`\n",
            },
          ],
          links: [
            {
              title: 'View in RH AAP',
              url: "${{ steps['launch-job'].output.data.url }}",
            },
          ],
        },
      },
      relations: [
        {
          type: 'ownedBy',
          targetRef: 'group:default/redhat',
          target: {
            kind: 'group',
            namespace: 'default',
            name: 'redhat',
          },
        },
      ],
    }),
  ),
  getEntities: jest.fn().mockImplementation(() =>
    Promise.resolve({
      items: [
        {
          metadata: {
            annotations: {
              'backstage.io/managed-by-location':
                'url:https://github.com//tree/update-urls/generic-seed/template.yaml',
              'backstage.io/managed-by-origin-location':
                'url:https://github.com//blob/update-urls/seed.yaml',
              'backstage.io/view-url':
                'https://github.com//tree/update-urls/generic-seed/template.yaml',
              'backstage.io/edit-url':
                'https://github.com//edit/update-urls/generic-seed/template.yaml',
              'backstage.io/source-location':
                'url:https://github.com//tree/update-urls/generic-seed/',
            },
            name: 'generic-seed',
            title: 'Create wizard use cases',
            description:
              'Use this template to create actual wizard use case templates',
            namespace: 'default',
            tags: ['aap-operations', 'intermediate'],
            uid: '4235f4ae-a596-4ed4-9973-6872eb85971e',
            etag: 'e0138197d283e66c37b74bf0d1e355fcd481fa8f',
          },
          apiVersion: 'scaffolder.backstage.io/v1beta3',
          kind: 'Template',
          spec: {
            owner: 'RedHat',
            type: 'service',
            parameters: [
              {
                title: 'Project data',
                description: 'Provide project data',
                required: ['token', 'organization', 'scmUrl'],
                properties: {
                  token: {
                    title: 'Token',
                    type: 'string',
                    description: 'Oauth2 token',
                    'ui:field': 'AAPTokenField',
                    'ui:backstage': {
                      review: {
                        show: false,
                      },
                    },
                  },
                  organization: {
                    title: 'Organization',
                    description: 'Select organization',
                    resource: 'organizations',
                    'ui:field': 'AAPResourcePicker',
                    default: {
                      id: 1,
                      name: 'Default',
                    },
                  },
                  jobInventory: {
                    title: 'Inventory',
                    description: 'Select inventory',
                    resource: 'inventories',
                    'ui:field': 'AAPResourcePicker',
                    default: {
                      id: 1,
                      name: 'Default',
                    },
                  },
                  scmUrl: {
                    title: 'Source control URL',
                    type: 'string',
                    'ui:help': 'Source control URL: gitSourceControlUrlHelp',
                    'ui:options': {
                      rows: 5,
                    },
                    default:
                      'https://github.com/ansible/ansible-pattern-loader',
                  },
                  scmBranch: {
                    title: 'Source control branch/tag/commit',
                    type: 'string',
                    'ui:options': {
                      rows: 5,
                    },
                    default: 'main',
                    'ui:help':
                      'Branch to checkout. In addition to branches, you can input tags, commit hashes, and arbitrary refs. Some commit hashes and refs may not be available unless you also provide a custom refspec.',
                  },
                },
              },
              {
                title: 'Template data',
                description: 'Provide template data',
                required: [
                  'token',
                  'useCases',
                  'playbook',
                  'aapHostName',
                  'aapUserName',
                  'aapPassword',
                ],
                properties: {
                  token: {
                    title: 'Token',
                    type: 'string',
                    description: 'Oauth2 token',
                    'ui:field': 'AAPTokenField',
                    'ui:backstage': {
                      review: {
                        show: false,
                      },
                    },
                  },
                  useCases: {
                    title: 'Use cases',
                    type: 'array',
                    items: {
                      type: 'object',
                      enum: [
                        {
                          name: 'rhel',
                          url: 'https://github.com/justinc1/experience_demo',
                          version: 'feature-service-aae',
                        },
                        {
                          name: 'network',
                          url: 'https://github.com/rohitthakur2590/network.backup',
                          version: 'main',
                        },
                        {
                          name: 'windows',
                          url: 'https://github.com/redhat-cop/infra.windows_ops',
                          version: 'main',
                        },
                      ],
                      enumNames: ['Rhel', 'Network', 'Windows'],
                    },
                    uniqueItems: true,
                    'ui:widget': 'checkboxes',
                  },
                  playbook: {
                    title: 'Playbook',
                    description: 'Select playbook',
                    type: 'string',
                    'ui:options': {
                      rows: 5,
                    },
                    default: 'seed_portal_content.yml',
                  },
                  aapHostName: {
                    title: 'AAP URL',
                    type: 'string',
                    'ui:options': {
                      rows: 5,
                    },
                  },
                  aapUserName: {
                    title: 'AAP username',
                    type: 'string',
                    'ui:options': {
                      rows: 5,
                    },
                    default: 'admin',
                  },
                  aapPassword: {
                    title: 'AAP password',
                    type: 'string',
                    'ui:field': 'Secret',
                    'ui:options': {
                      rows: 5,
                    },
                  },
                  aapValidateCerts: {
                    title: 'AAP validate certs',
                    type: 'boolean',
                    default: false,
                  },
                },
              },
            ],
            steps: [
              {
                id: 'create-project',
                name: 'Create project',
                action: 'rhaap:create-project',
                input: {
                  token: '${{ parameters.token }}',
                  deleteIfExist: true,
                  values: {
                    projectName: 'RH AAP Demo Seed Job Template Project',
                    projectDescription: 'RH AAP Demo Seed Job Template Project',
                    organization: '${{ parameters.organization }}',
                    scmUrl: '${{ parameters.scmUrl }}',
                    scmBranch: '${{ parameters.scmBranch }}',
                    scmUpdateOnLaunch: true,
                  },
                },
              },
              {
                id: 'create-ee',
                name: 'Create execution environment',
                action: 'rhaap:create-execution-environment',
                input: {
                  token: '${{ parameters.token }}',
                  deleteIfExist: true,
                  values: {
                    environmentName:
                      'RH AAP Demo Seed Job Template execution environment',
                    organization: '${{ parameters.organization }}',
                    image: 'quay.io/justinc1_github/apd-ee-25-seedseed:latest',
                    pull: 'always',
                  },
                },
              },
              {
                id: 'create-template',
                name: 'Create job template',
                action: 'rhaap:create-job-template',
                input: {
                  token: '${{ parameters.token }}',
                  deleteIfExist: true,
                  values: {
                    templateName: 'RH AAP Demo Seed Job Template',
                    templateDescription: 'RH AAP Demo Seed Job Template',
                    project: "${{steps['create-project'].output.project }}",
                    organization: '${{ parameters.organization }}',
                    jobInventory: '${{ parameters.jobInventory }}',
                    playbook: '${{ parameters.playbook }}',
                    executionEnvironment:
                      "${{steps['create-ee'].output.executionEnvironment }}",
                    extraVariables: {
                      aap_hostname: '${{ parameters.aapHostName }}',
                      aap_username: '${{ parameters.aapUserName }}',
                      aap_password: '${{ secrets.aapPassword }}',
                      aap_validate_certs: '${{ parameters.aapValidateCerts }}',
                      usecases: '${{ parameters.useCases }}',
                      seed_usecase:
                        '${{ parameters.useCases | useCaseNameFilter }}',
                      organization_name:
                        "${{ parameters.organization | resourceFilter('name')}}",
                    },
                  },
                },
              },
              {
                id: 'launch-job',
                name: 'Launch job template',
                action: 'rhaap:launch-job-template',
                input: {
                  token: '${{ parameters.token }}',
                  values: {
                    templateID:
                      "${{steps['create-template'].output.template.id }}",
                  },
                },
              },
              {
                id: 'clean-up',
                name: 'Clean up',
                action: 'rhaap:clean-up',
                input: {
                  token: '${{ parameters.token }}',
                  values: {
                    project: "${{steps['create-project'].output.project }}",
                    executionEnvironment:
                      "${{steps['create-ee'].output.executionEnvironment }}",
                    template: "${{steps['create-template'].output.template }}",
                  },
                },
              },
              {
                id: 'create-showcase',
                name: 'Create showcases',
                action: 'rhaap:create-show-cases',
                input: {
                  token: '${{ parameters.token }}',
                  values: {
                    organization: '${{ parameters.organization }}',
                    templateNames: [
                      'RHEL / Configure Services',
                      'RHEL / Update RHEL Time Servers',
                      'Network Operations / Create Full Network Backup',
                      'Network Operations / Restore Config',
                      'Windows Operations / Create IIS',
                      'Windows Operations / Delete IIS',
                    ],
                  },
                },
              },
            ],
            output: {
              text: [
                {
                  title: 'Job generic seed template executed successfully',
                  content:
                    "**Job ID:** `${{ steps['launch-job'].output.data.id }}`\n",
                },
              ],
              links: [
                {
                  title: 'View in RH AAP',
                  url: "${{ steps['launch-job'].output.data.url }}",
                },
              ],
            },
          },
          relations: [
            {
              type: 'ownedBy',
              targetRef: 'group:default/redhat',
              target: {
                kind: 'group',
                namespace: 'default',
                name: 'redhat',
              },
            },
          ],
        },
      ],
    }),
  ),
} as any;
