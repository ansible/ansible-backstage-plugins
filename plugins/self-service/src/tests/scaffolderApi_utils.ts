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
import { ScaffolderApi } from '@backstage/plugin-scaffolder-react';

export const mockScaffolderApi: jest.Mocked<ScaffolderApi> = {
  getTemplateParameterSchema: jest.fn().mockResolvedValue({
    title: 'Create wizard use cases',
    description: 'Use this template to create actual wizard use case templates',
    steps: [],
  }),
  autocomplete: jest.fn().mockResolvedValue({
    results: [
      { id: '1', title: 'Template 1' },
      { id: '2', title: 'Template 2' },
    ],
  }) as jest.MockedFunction<any>,
  listTasks: jest.fn().mockImplementation(() =>
    Promise.resolve({
      tasks: [
        {
          id: 'ab8466fa-d062-4484-a506-b00c15058afd',
          spec: {
            apiVersion: 'scaffolder.backstage.io/v1beta3',
            steps: [
              {
                id: 'launch-job',
                name: 'Launch RHEL / Configure Services',
                action: 'rhaap:launch-job-template',
                input: {
                  token: '${{ parameters.token }}',
                  values: {
                    templateID: 645,
                    inventory: '${{ parameters.inventory  }}',
                    credentials: '${{ parameters.credentials }}',
                    extraVariables: {
                      service_names_str: '${{ parameters.rhelServices }}',
                      service_state: '${{ parameters.serviceState }}',
                      service_enabled: '${{ parameters.serviceEnabled }}',
                    },
                  },
                },
              },
            ],
            output: {
              text: [
                {
                  title:
                    'Launch RHEL / Configure Services template executed successfully',
                  content:
                    "**Job ID:** ${{ steps['launch-job'].output.data.id }}\n**Job STATUS:** ${{ steps['launch-job'].output.data.status }}\n",
                },
              ],
              links: [
                {
                  title: 'View in RH AAP',
                  url: "${{ steps['launch-job'].output.data.url }}",
                },
              ],
            },
            parameters: {
              credentials: [
                {
                  id: 2,
                  type: 'credential',
                  url: '/api/controller/v2/credentials/2/',
                  related: {
                    created_by: '/api/controller/v2/users/1/',
                    modified_by: '/api/controller/v2/users/1/',
                    activity_stream:
                      '/api/controller/v2/credentials/2/activity_stream/',
                    access_list:
                      '/api/controller/v2/credentials/2/access_list/',
                    object_roles:
                      '/api/controller/v2/credentials/2/object_roles/',
                    owner_users:
                      '/api/controller/v2/credentials/2/owner_users/',
                    owner_teams:
                      '/api/controller/v2/credentials/2/owner_teams/',
                    copy: '/api/controller/v2/credentials/2/copy/',
                    input_sources:
                      '/api/controller/v2/credentials/2/input_sources/',
                    credential_type: '/api/controller/v2/credential_types/19/',
                  },
                  summary_fields: {
                    credential_type: {
                      id: 19,
                      name: 'Ansible Galaxy/Automation Hub API Token',
                      description: '',
                    },
                    created_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    modified_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    object_roles: {
                      admin_role: {
                        description: 'Can manage all aspects of the credential',
                        name: 'Admin',
                        id: 29,
                      },
                      use_role: {
                        description: 'Can use the credential in a job template',
                        name: 'Use',
                        id: 30,
                      },
                      read_role: {
                        description: 'May view settings for the credential',
                        name: 'Read',
                        id: 31,
                      },
                    },
                    user_capabilities: {
                      edit: false,
                      delete: false,
                      copy: true,
                      use: true,
                    },
                    owners: [],
                  },
                  created: '2024-10-14T13:24:35.076293Z',
                  modified: '2024-10-14T13:24:35.076304Z',
                  name: 'Ansible Galaxy',
                  description: '',
                  organization: null,
                  credential_type: 19,
                  managed: true,
                  inputs: {
                    url: 'https://galaxy.ansible.com/',
                  },
                  kind: 'galaxy_api_token',
                  cloud: false,
                  kubernetes: false,
                },
                {
                  id: 6,
                  type: 'credential',
                  url: '/api/controller/v2/credentials/6/',
                  related: {
                    created_by: '/api/controller/v2/users/1/',
                    modified_by: '/api/controller/v2/users/1/',
                    activity_stream:
                      '/api/controller/v2/credentials/6/activity_stream/',
                    access_list:
                      '/api/controller/v2/credentials/6/access_list/',
                    object_roles:
                      '/api/controller/v2/credentials/6/object_roles/',
                    owner_users:
                      '/api/controller/v2/credentials/6/owner_users/',
                    owner_teams:
                      '/api/controller/v2/credentials/6/owner_teams/',
                    copy: '/api/controller/v2/credentials/6/copy/',
                    input_sources:
                      '/api/controller/v2/credentials/6/input_sources/',
                    credential_type: '/api/controller/v2/credential_types/1/',
                  },
                  summary_fields: {
                    credential_type: {
                      id: 1,
                      name: 'Machine',
                      description: '',
                    },
                    created_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    modified_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    object_roles: {
                      admin_role: {
                        description: 'Can manage all aspects of the credential',
                        name: 'Admin',
                        id: 857,
                      },
                      use_role: {
                        description: 'Can use the credential in a job template',
                        name: 'Use',
                        id: 858,
                      },
                      read_role: {
                        description: 'May view settings for the credential',
                        name: 'Read',
                        id: 859,
                      },
                    },
                    user_capabilities: {
                      edit: true,
                      delete: true,
                      copy: true,
                      use: true,
                    },
                    owners: [],
                  },
                  created: '2024-11-18T17:30:29.438896Z',
                  modified: '2024-12-12T07:38:44.469762Z',
                  name: 'Ansible Pattern RHEL Credentials',
                  description: 'ae-rhel-demo-credentials',
                  organization: null,
                  credential_type: 1,
                  managed: false,
                  inputs: {
                    ssh_key_data: '$encrypted$',
                  },
                  kind: 'ssh',
                  cloud: false,
                  kubernetes: false,
                },
              ],
              token: 'test-token',
              inventory: {
                id: 4,
                type: 'inventory',
                url: '/api/controller/v2/inventories/4/',
                related: {
                  created_by: '/api/controller/v2/users/1/',
                  modified_by: '/api/controller/v2/users/1/',
                  hosts: '/api/controller/v2/inventories/4/hosts/',
                  variable_data:
                    '/api/controller/v2/inventories/4/variable_data/',
                  script: '/api/controller/v2/inventories/4/script/',
                  activity_stream:
                    '/api/controller/v2/inventories/4/activity_stream/',
                  job_templates:
                    '/api/controller/v2/inventories/4/job_templates/',
                  ad_hoc_commands:
                    '/api/controller/v2/inventories/4/ad_hoc_commands/',
                  access_list: '/api/controller/v2/inventories/4/access_list/',
                  object_roles:
                    '/api/controller/v2/inventories/4/object_roles/',
                  instance_groups:
                    '/api/controller/v2/inventories/4/instance_groups/',
                  copy: '/api/controller/v2/inventories/4/copy/',
                  labels: '/api/controller/v2/inventories/4/labels/',
                  groups: '/api/controller/v2/inventories/4/groups/',
                  root_groups: '/api/controller/v2/inventories/4/root_groups/',
                  update_inventory_sources:
                    '/api/controller/v2/inventories/4/update_inventory_sources/',
                  inventory_sources:
                    '/api/controller/v2/inventories/4/inventory_sources/',
                  tree: '/api/controller/v2/inventories/4/tree/',
                  organization: '/api/controller/v2/organizations/1/',
                },
                summary_fields: {
                  organization: {
                    id: 1,
                    name: 'Default',
                    description:
                      'The default organization for Ansible Automation Platform',
                  },
                  created_by: {
                    id: 1,
                    username: 'admin',
                    first_name: '',
                    last_name: '',
                  },
                  modified_by: {
                    id: 1,
                    username: 'admin',
                    first_name: '',
                    last_name: '',
                  },
                  object_roles: {
                    admin_role: {
                      description: 'Can manage all aspects of the inventory',
                      name: 'Admin',
                      id: 852,
                    },
                    update_role: {
                      description: 'May update the inventory',
                      name: 'Update',
                      id: 853,
                    },
                    adhoc_role: {
                      description: 'May run ad hoc commands on the inventory',
                      name: 'Ad Hoc',
                      id: 854,
                    },
                    use_role: {
                      description: 'Can use the inventory in a job template',
                      name: 'Use',
                      id: 855,
                    },
                    read_role: {
                      description: 'May view settings for the inventory',
                      name: 'Read',
                      id: 856,
                    },
                  },
                  user_capabilities: {
                    edit: true,
                    delete: true,
                    copy: true,
                    adhoc: true,
                  },
                  labels: {
                    count: 0,
                    results: [],
                  },
                },
                created: '2024-11-18T17:25:16.325577Z',
                modified: '2024-12-12T07:38:37.456560Z',
                name: 'Ansible Pattern RHEL Inventory',
                description: 'Demo RHEL services',
                organization: 1,
                kind: '',
                host_filter: null,
                variables: '',
                has_active_failures: true,
                total_hosts: 1,
                hosts_with_active_failures: 1,
                total_groups: 0,
                has_inventory_sources: false,
                total_inventory_sources: 0,
                inventory_sources_with_failures: 0,
                pending_deletion: false,
                prevent_instance_group_fallback: false,
              },
              rhelServices: 'chronyd auditd',
              serviceEnabled: 'Yes',
              serviceState: 'started',
            },
            user: {
              entity: {
                metadata: {
                  annotations: {
                    'backstage.io/managed-by-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/managed-by-origin-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/view-url':
                      'https://10.44.17.180//access/users/10/details',
                  },
                  namespace: 'default',
                  name: 'aljaz',
                  title: 'aljaz',
                  uid: '8693379a-b269-4757-b82e-f03e899f8716',
                  etag: 'e0da335670a8e8484e357e4a40a7d8ca2e5d49ac',
                },
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'User',
                spec: {
                  profile: {
                    username: 'aljaz',
                    displayName: 'aljaz',
                    email: 'aljaz.nuncic@xlab.si',
                  },
                  memberOf: ['team-a-1', 'team-b-2'],
                },
                relations: [
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-a-1',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-a-1',
                    },
                  },
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-b-2',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-b-2',
                    },
                  },
                ],
              },
              ref: 'user:default/aljaz',
            },
            templateInfo: {
              entityRef: 'template:default/rhel-configure-service',
              baseUrl:
                'file:///home/aljaznuncic/workspace/redhat//aap-showcases/rhelConfigureService.yaml',
              entity: {
                metadata: {
                  annotations: {
                    'backstage.io/managed-by-location':
                      'file:/home/aljaznuncic/workspace/redhat//aap-showcases/rhelConfigureService.yaml',
                    'backstage.io/managed-by-origin-location':
                      'file:/home/aljaznuncic/workspace/redhat//aap-showcases/all.yaml',
                  },
                  name: 'rhel-configure-service',
                  title: 'Manage RHEL services',
                  description:
                    'This wizard will guide you on how to manage selected RHEL services',
                  namespace: 'default',
                  tags: ['aap-operations', 'intermediate', 'rhel'],
                  uid: 'a81bbf4c-1a0f-44ff-acd0-ff2c8ea37875',
                  etag: '5901d8a7641a1f134b0f714217094b379fa01af9',
                },
              },
            },
          },
          status: 'completed',
          createdBy: 'user:default/aljaz',
          lastHeartbeatAt: '2024-12-14T10:14:01.622Z',
          createdAt: '2024-12-14T10:13:43.484Z',
        },
        {
          id: 'ef2c2c88-f41c-4038-b6f1-017f9a19b8a2',
          spec: {
            apiVersion: 'scaffolder.backstage.io/v1beta3',
            steps: [
              {
                id: 'launch-job',
                name: 'Launch RHEL / Configure Services',
                action: 'rhaap:launch-job-template',
                input: {
                  token: '${{ parameters.token }}',
                  values: {
                    templateID: 645,
                    inventory: '${{ parameters.inventory  }}',
                    credentials: '${{ parameters.credentials }}',
                    extraVariables: {
                      service_names_str: '${{ parameters.rhelServices }}',
                      service_state: '${{ parameters.serviceState }}',
                      service_enabled: '${{ parameters.serviceEnabled }}',
                    },
                  },
                },
              },
            ],
            output: {
              text: [
                {
                  title:
                    'Launch RHEL / Configure Services template executed successfully',
                  content:
                    "**Job ID:** ${{ steps['launch-job'].output.data.id }}\n**Job STATUS:** ${{ steps['launch-job'].output.data.status }}\n",
                },
              ],
              links: [
                {
                  title: 'View in RH AAP',
                  url: "${{ steps['launch-job'].output.data.url }}",
                },
              ],
            },
            parameters: {
              credentials: [
                {
                  id: 9,
                  type: 'credential',
                  url: '/api/controller/v2/credentials/9/',
                  related: {
                    created_by: '/api/controller/v2/users/1/',
                    modified_by: '/api/controller/v2/users/1/',
                    activity_stream:
                      '/api/controller/v2/credentials/9/activity_stream/',
                    access_list:
                      '/api/controller/v2/credentials/9/access_list/',
                    object_roles:
                      '/api/controller/v2/credentials/9/object_roles/',
                    owner_users:
                      '/api/controller/v2/credentials/9/owner_users/',
                    owner_teams:
                      '/api/controller/v2/credentials/9/owner_teams/',
                    copy: '/api/controller/v2/credentials/9/copy/',
                    input_sources:
                      '/api/controller/v2/credentials/9/input_sources/',
                    credential_type: '/api/controller/v2/credential_types/1/',
                  },
                  summary_fields: {
                    credential_type: {
                      id: 1,
                      name: 'Machine',
                      description: '',
                    },
                    created_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    modified_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    object_roles: {
                      admin_role: {
                        description: 'Can manage all aspects of the credential',
                        name: 'Admin',
                        id: 1756,
                      },
                      use_role: {
                        description: 'Can use the credential in a job template',
                        name: 'Use',
                        id: 1757,
                      },
                      read_role: {
                        description: 'May view settings for the credential',
                        name: 'Read',
                        id: 1758,
                      },
                    },
                    user_capabilities: {
                      edit: true,
                      delete: true,
                      copy: true,
                      use: true,
                    },
                    owners: [],
                  },
                  created: '2024-12-05T10:55:39.564291Z',
                  modified: '2024-12-12T13:13:41.040420Z',
                  name: 'Ansible Pattern Network Credentials',
                  description: 'network usecase',
                  organization: null,
                  credential_type: 1,
                  managed: false,
                  inputs: {
                    password: '$encrypted$',
                    username: 'cisco',
                    become_method: 'enable',
                    become_password: '$encrypted$',
                  },
                  kind: 'ssh',
                  cloud: false,
                  kubernetes: false,
                },
                {
                  id: 8,
                  type: 'credential',
                  url: '/api/controller/v2/credentials/8/',
                  related: {
                    created_by: '/api/controller/v2/users/1/',
                    modified_by: '/api/controller/v2/users/1/',
                    organization: '/api/controller/v2/organizations/1/',
                    activity_stream:
                      '/api/controller/v2/credentials/8/activity_stream/',
                    access_list:
                      '/api/controller/v2/credentials/8/access_list/',
                    object_roles:
                      '/api/controller/v2/credentials/8/object_roles/',
                    owner_users:
                      '/api/controller/v2/credentials/8/owner_users/',
                    owner_teams:
                      '/api/controller/v2/credentials/8/owner_teams/',
                    copy: '/api/controller/v2/credentials/8/copy/',
                    input_sources:
                      '/api/controller/v2/credentials/8/input_sources/',
                    credential_type: '/api/controller/v2/credential_types/1/',
                  },
                  summary_fields: {
                    organization: {
                      id: 1,
                      name: 'Default',
                      description:
                        'The default organization for Ansible Automation Platform',
                    },
                    credential_type: {
                      id: 1,
                      name: 'Machine',
                      description: '',
                    },
                    created_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    modified_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    object_roles: {
                      admin_role: {
                        description: 'Can manage all aspects of the credential',
                        name: 'Admin',
                        id: 1741,
                      },
                      use_role: {
                        description: 'Can use the credential in a job template',
                        name: 'Use',
                        id: 1742,
                      },
                      read_role: {
                        description: 'May view settings for the credential',
                        name: 'Read',
                        id: 1743,
                      },
                    },
                    user_capabilities: {
                      edit: true,
                      delete: true,
                      copy: true,
                      use: true,
                    },
                    owners: [
                      {
                        id: 1,
                        type: 'organization',
                        name: 'Default',
                        description:
                          'The default organization for Ansible Automation Platform',
                        url: '/api/controller/v2/organizations/1/',
                      },
                    ],
                  },
                  created: '2024-12-05T10:26:36.767107Z',
                  modified: '2024-12-12T09:03:41.474428Z',
                  name: 'Ansible Pattern Windows Credentials VM1',
                  description: 'for windows usecase VM1 - for bpeck',
                  organization: 1,
                  credential_type: 1,
                  managed: false,
                  inputs: {
                    password: '$encrypted$',
                    username: 'azureuser',
                  },
                  kind: 'ssh',
                  cloud: false,
                  kubernetes: false,
                },
                {
                  id: 10,
                  type: 'credential',
                  url: '/api/controller/v2/credentials/10/',
                  related: {
                    created_by: '/api/controller/v2/users/1/',
                    modified_by: '/api/controller/v2/users/1/',
                    organization: '/api/controller/v2/organizations/1/',
                    activity_stream:
                      '/api/controller/v2/credentials/10/activity_stream/',
                    access_list:
                      '/api/controller/v2/credentials/10/access_list/',
                    object_roles:
                      '/api/controller/v2/credentials/10/object_roles/',
                    owner_users:
                      '/api/controller/v2/credentials/10/owner_users/',
                    owner_teams:
                      '/api/controller/v2/credentials/10/owner_teams/',
                    copy: '/api/controller/v2/credentials/10/copy/',
                    input_sources:
                      '/api/controller/v2/credentials/10/input_sources/',
                    credential_type: '/api/controller/v2/credential_types/1/',
                  },
                  summary_fields: {
                    organization: {
                      id: 1,
                      name: 'Default',
                      description:
                        'The default organization for Ansible Automation Platform',
                    },
                    credential_type: {
                      id: 1,
                      name: 'Machine',
                      description: '',
                    },
                    created_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    modified_by: {
                      id: 1,
                      username: 'admin',
                      first_name: '',
                      last_name: '',
                    },
                    object_roles: {
                      admin_role: {
                        description: 'Can manage all aspects of the credential',
                        name: 'Admin',
                        id: 2184,
                      },
                      use_role: {
                        description: 'Can use the credential in a job template',
                        name: 'Use',
                        id: 2185,
                      },
                      read_role: {
                        description: 'May view settings for the credential',
                        name: 'Read',
                        id: 2186,
                      },
                    },
                    user_capabilities: {
                      edit: true,
                      delete: true,
                      copy: true,
                      use: true,
                    },
                    owners: [
                      {
                        id: 1,
                        type: 'organization',
                        name: 'Default',
                        description:
                          'The default organization for Ansible Automation Platform',
                        url: '/api/controller/v2/organizations/1/',
                      },
                    ],
                  },
                  created: '2024-12-12T08:55:30.359110Z',
                  modified: '2024-12-12T09:03:57.953223Z',
                  name: 'Ansible Pattern Windows Credentials VM2',
                  description: 'for windows usecase VM2 - for XLAB',
                  organization: 1,
                  credential_type: 1,
                  managed: false,
                  inputs: {
                    password: '$encrypted$',
                    username: 'azureuser',
                  },
                  kind: 'ssh',
                  cloud: false,
                  kubernetes: false,
                },
              ],
              token: 'test-token',
              inventory: {
                id: 4,
                type: 'inventory',
                url: '/api/controller/v2/inventories/4/',
                related: {
                  created_by: '/api/controller/v2/users/1/',
                  modified_by: '/api/controller/v2/users/1/',
                  hosts: '/api/controller/v2/inventories/4/hosts/',
                  variable_data:
                    '/api/controller/v2/inventories/4/variable_data/',
                  script: '/api/controller/v2/inventories/4/script/',
                  activity_stream:
                    '/api/controller/v2/inventories/4/activity_stream/',
                  job_templates:
                    '/api/controller/v2/inventories/4/job_templates/',
                  ad_hoc_commands:
                    '/api/controller/v2/inventories/4/ad_hoc_commands/',
                  access_list: '/api/controller/v2/inventories/4/access_list/',
                  object_roles:
                    '/api/controller/v2/inventories/4/object_roles/',
                  instance_groups:
                    '/api/controller/v2/inventories/4/instance_groups/',
                  copy: '/api/controller/v2/inventories/4/copy/',
                  labels: '/api/controller/v2/inventories/4/labels/',
                  groups: '/api/controller/v2/inventories/4/groups/',
                  root_groups: '/api/controller/v2/inventories/4/root_groups/',
                  update_inventory_sources:
                    '/api/controller/v2/inventories/4/update_inventory_sources/',
                  inventory_sources:
                    '/api/controller/v2/inventories/4/inventory_sources/',
                  tree: '/api/controller/v2/inventories/4/tree/',
                  organization: '/api/controller/v2/organizations/1/',
                },
                summary_fields: {
                  organization: {
                    id: 1,
                    name: 'Default',
                    description:
                      'The default organization for Ansible Automation Platform',
                  },
                  created_by: {
                    id: 1,
                    username: 'admin',
                    first_name: '',
                    last_name: '',
                  },
                  modified_by: {
                    id: 1,
                    username: 'admin',
                    first_name: '',
                    last_name: '',
                  },
                  object_roles: {
                    admin_role: {
                      description: 'Can manage all aspects of the inventory',
                      name: 'Admin',
                      id: 852,
                    },
                    update_role: {
                      description: 'May update the inventory',
                      name: 'Update',
                      id: 853,
                    },
                    adhoc_role: {
                      description: 'May run ad hoc commands on the inventory',
                      name: 'Ad Hoc',
                      id: 854,
                    },
                    use_role: {
                      description: 'Can use the inventory in a job template',
                      name: 'Use',
                      id: 855,
                    },
                    read_role: {
                      description: 'May view settings for the inventory',
                      name: 'Read',
                      id: 856,
                    },
                  },
                  user_capabilities: {
                    edit: true,
                    delete: true,
                    copy: true,
                    adhoc: true,
                  },
                  labels: {
                    count: 0,
                    results: [],
                  },
                },
                created: '2024-11-18T17:25:16.325577Z',
                modified: '2024-12-12T07:38:37.456560Z',
                name: 'Ansible Pattern RHEL Inventory',
                description: 'Demo RHEL services',
                organization: 1,
                kind: '',
                host_filter: null,
                variables: '',
                has_active_failures: true,
                total_hosts: 1,
                hosts_with_active_failures: 1,
                total_groups: 0,
                has_inventory_sources: false,
                total_inventory_sources: 0,
                inventory_sources_with_failures: 0,
                pending_deletion: false,
                prevent_instance_group_fallback: false,
              },
              rhelServices: 'chronyd auditd',
              serviceEnabled: 'Yes',
              serviceState: 'stopped',
            },
            user: {
              entity: {
                metadata: {
                  annotations: {
                    'backstage.io/managed-by-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/managed-by-origin-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/view-url':
                      'https://10.44.17.180//access/users/10/details',
                  },
                  namespace: 'default',
                  name: 'aljaz',
                  title: 'aljaz',
                  uid: '8693379a-b269-4757-b82e-f03e899f8716',
                  etag: 'e0da335670a8e8484e357e4a40a7d8ca2e5d49ac',
                },
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'User',
                spec: {
                  profile: {
                    username: 'aljaz',
                    displayName: 'aljaz',
                    email: 'aljaz.nuncic@xlab.si',
                  },
                  memberOf: ['team-a-1', 'team-b-2'],
                },
                relations: [
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-a-1',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-a-1',
                    },
                  },
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-b-2',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-b-2',
                    },
                  },
                ],
              },
              ref: 'user:default/aljaz',
            },
            templateInfo: {
              entityRef: 'template:default/rhel-configure-service',
              baseUrl:
                'file:///home/aljaznuncic/workspace/redhat//aap-showcases/rhelConfigureService.yaml',
              entity: {
                metadata: {
                  annotations: {
                    'backstage.io/managed-by-location':
                      'file:/home/aljaznuncic/workspace/redhat//aap-showcases/rhelConfigureService.yaml',
                    'backstage.io/managed-by-origin-location':
                      'file:/home/aljaznuncic/workspace/redhat//aap-showcases/all.yaml',
                  },
                  name: 'rhel-configure-service',
                  title: 'Manage RHEL services',
                  description:
                    'This wizard will guide you on how to manage selected RHEL services',
                  namespace: 'default',
                  tags: ['aap-operations', 'intermediate', 'rhel'],
                  uid: 'a81bbf4c-1a0f-44ff-acd0-ff2c8ea37875',
                  etag: '5901d8a7641a1f134b0f714217094b379fa01af9',
                },
              },
            },
          },
          status: 'failed',
          createdBy: 'user:default/aljaz',
          lastHeartbeatAt: '2024-12-14T10:13:21.222Z',
          createdAt: '2024-12-14T10:13:21.213Z',
        },
        {
          id: 'd02d3cee-ff4f-4749-b64e-844a939b080d',
          spec: {
            apiVersion: 'scaffolder.backstage.io/v1beta3',
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
            parameters: {
              organization: {
                id: 1,
                name: 'Default',
              },
              jobInventory: {
                id: 1,
                name: 'Default',
              },
              scmUrl: 'https://github.com/ansible/ansible-pattern-loader',
              scmBranch: 'main',
              token: 'test-token',
              useCases: [
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
              playbook: 'seed_portal_content.yml',
              aapUserName: 'admin',
              aapValidateCerts: false,
              aapHostName: 'https://10.44.17.180',
              aapPassword: '*******',
            },
            user: {
              entity: {
                metadata: {
                  annotations: {
                    'backstage.io/managed-by-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/managed-by-origin-location':
                      'url:https://10.44.17.180//access/users/10/details',
                    'backstage.io/view-url':
                      'https://10.44.17.180//access/users/10/details',
                  },
                  namespace: 'default',
                  name: 'aljaz',
                  title: 'aljaz',
                  uid: '8693379a-b269-4757-b82e-f03e899f8716',
                  etag: 'e0da335670a8e8484e357e4a40a7d8ca2e5d49ac',
                },
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'User',
                spec: {
                  profile: {
                    username: 'aljaz',
                    displayName: 'aljaz',
                    email: 'aljaz.nuncic@xlab.si',
                  },
                  memberOf: ['team-a-1', 'team-b-2'],
                },
                relations: [
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-a-1',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-a-1',
                    },
                  },
                  {
                    type: 'memberOf',
                    targetRef: 'group:default/team-b-2',
                    target: {
                      kind: 'group',
                      namespace: 'default',
                      name: 'team-b-2',
                    },
                  },
                ],
              },
              ref: 'user:default/aljaz',
            },
            templateInfo: {
              entityRef: 'template:default/generic-seed',
              baseUrl: 'https://github.com//tree/update-urls/generic-seed/',
              entity: {
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
              },
            },
          },
          status: 'completed',
          createdBy: 'user:default/aljaz',
          lastHeartbeatAt: '2024-12-14T10:11:51.095Z',
          createdAt: '2024-12-14T10:08:28.610Z',
        },
      ],
      totalTasks: '3',
    }),
  ),
} as any;
