import { ConfigReader } from '@backstage/config';
import {
  MOCK_BASE_URL,
  MOCK_CONFIG,
  MOCK_ROLE_ASSIGNMENT_RESPONSE,
  MOCK_USER_TEAM_RESPONSE_2,
  MOCK_USER_TEAM_RESPONSE_1,
  MOCK_USERS_RESPONSE,
  MOCK_ORG_TEAMS_RESPONSE,
  MOCK_ORG_USERS_RESPONSE,
  MOCK_ORGANIZATION_DETAILS_RESPONSE,
  MOCK_ORG_TEAM_USERS_RESPONSE,
  mockAnsibleService,
} from '../mock';
import { AAPEntityProvider } from './AAPEntityProvider';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  fetch: jest.fn(async (input: any) => {
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/organizations/`) {
      return Promise.resolve(MOCK_ORGANIZATION_DETAILS_RESPONSE);
    }
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/teams/`) {
      return Promise.resolve(MOCK_ORG_TEAMS_RESPONSE);
    }
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/teams/1/users`) {
      return Promise.resolve(MOCK_ORG_TEAM_USERS_RESPONSE);
    }
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/users/`) {
      return Promise.resolve(MOCK_ORG_USERS_RESPONSE);
    }
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/role_user_assignments/`) {
      return Promise.resolve(MOCK_ROLE_ASSIGNMENT_RESPONSE);
    }
    if (input === `${MOCK_BASE_URL}/api/gateway/v1/users/`) {
      return Promise.resolve(MOCK_USERS_RESPONSE);
    }
    if (
      input.startsWith(`${MOCK_BASE_URL}/api/gateway/v1/users/`) &&
      input.endsWith('/teams/')
    ) {
      const parts = input.split('/');
      const userId = parts[7];
      if (userId === '1') return Promise.resolve(MOCK_USER_TEAM_RESPONSE_1);
      if (userId === '2') return Promise.resolve(MOCK_USER_TEAM_RESPONSE_2);
    }
    return null;
  }),
}));

class PersistingTaskRunner implements SchedulerServiceTaskRunner {
  private tasks: SchedulerServiceTaskInvocationDefinition[] = [];

  getTasks() {
    return this.tasks;
  }

  run(task: SchedulerServiceTaskInvocationDefinition): Promise<void> {
    this.tasks.push(task);
    return Promise.resolve(undefined);
  }
}

describe('AAPEntityProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const expectedEntities = [
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        namespace: 'default',
        name: 'default',
        title: 'Default',
        annotations: {
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/organizations/1/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/organizations/1/details',
        },
      },
      spec: {
        type: 'organization',
        children: ['team-a', 'team-b'],
        members: ['user1', 'user2'],
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        namespace: 'default',
        name: 'team-a',
        title: 'Team A',
        description: 'Team A description',
        annotations: {
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/teams/1/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/teams/1/details',
        },
      },
      spec: {
        type: 'team',
        children: [],
        members: [],
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        namespace: 'default',
        name: 'team-b',
        title: 'Team B',
        description: 'Team B description',
        annotations: {
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/teams/2/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/teams/2/details',
        },
      },
      spec: {
        type: 'team',
        children: [],
        members: [],
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        namespace: 'default',
        name: 'user1',
        title: 'User1 Last1',
        annotations: {
          'aap.platform/is_superuser': 'false',
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/users/1/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/users/1/details',
        },
      },
      spec: {
        profile: {
          username: 'user1',
          displayName: 'User1 Last1',
          email: 'user1@test.com',
        },
        memberOf: ['team-a', 'team-b'],
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        namespace: 'default',
        name: 'user2',
        title: 'User2 Last2',
        annotations: {
          'aap.platform/is_superuser': 'false',
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/users/2/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/users/2/details',
        },
      },
      spec: {
        profile: {
          username: 'user2',
          displayName: 'User2 Last2',
          email: 'user2@test.com',
        },
        memberOf: ['team-b'],
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        annotations: {
          'aap.platform/is_superuser': 'false',
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/users/1/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/users/1/details',
        },
        name: 'team_user1',
        namespace: 'default',
        title: 'TeamUser1 Last1',
      },
      spec: {
        memberOf: ['team-a', 'team-b'],
        profile: {
          displayName: 'TeamUser1 Last1',
          email: 'teamuser1@test.com',
          username: 'team_user1',
        },
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'User',
      metadata: {
        annotations: {
          'aap.platform/is_superuser': 'false',
          'backstage.io/managed-by-location':
            'url:https://rhaap.test/access/users/2/details',
          'backstage.io/managed-by-origin-location':
            'url:https://rhaap.test/access/users/2/details',
        },
        name: 'team_user2',
        namespace: 'default',
        title: 'TeamUser2 Last2',
      },
      spec: {
        memberOf: ['team-b'],
        profile: {
          displayName: 'TeamUser2 Last2',
          email: 'teamuser2@test.com',
          username: 'team_user2',
        },
      },
    },
    {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        annotations: {
          'aap.platform/last-sync': expect.any(String),
          'aap.platform/managed': 'true',
          'backstage.io/managed-by-location':
            'AapEntityProvider:development:development',
          'backstage.io/managed-by-origin-location':
            'AapEntityProvider:development:development',
        },
        description:
          'Ansible Automation Platform Superusers - Dynamically managed',
        name: 'aap-admins',
        namespace: 'default',
      },
      spec: {
        children: [],
        members: [], // No superusers in the mock data
        profile: {
          description:
            'Automatically assigned AAP superusers with RBAC admin access',
          displayName: 'AAP Administrators',
        },
        type: 'team',
      },
    },
  ].map(entity => ({
    entity,
    locationKey: 'AapEntityProvider:development',
  }));

  const expectMutation = async () => {
    const config = new ConfigReader(MOCK_CONFIG.data);
    const logger = mockServices.logger.mock();
    const schedulingConfig: Record<string, any> = {};

    mockAnsibleService.getOrganizations.mockResolvedValue([
      {
        organization: {
          id: 1,
          name: 'Default',
          namespace: 'default',
        },
        teams: [
          {
            id: 1,
            organization: 1,
            name: 'Team A',
            groupName: 'team-a',
            description: 'Team A description',
          },
          {
            id: 2,
            organization: 1,
            name: 'Team B',
            groupName: 'team-b',
            description: 'Team B description',
          },
        ],
        users: [
          {
            id: 1,
            url: 'https://rhaap.test/api/v2/users/1/',
            username: 'user1',
            email: 'user1@test.com',
            first_name: 'User1',
            last_name: 'Last1',
            is_superuser: false,
            is_orguser: false,
          },
          {
            id: 2,
            url: 'https://rhaap.test/api/v2/users/2/',
            username: 'user2',
            email: 'user2@test.com',
            first_name: 'User2',
            last_name: 'Last2',
            is_superuser: false,
          },
        ],
      },
    ]);

    mockAnsibleService.getUserRoleAssignments.mockResolvedValue({
      1: {
        'Team Member': [1, 2],
        'Organization Member': [1],
      },
      2: {
        'Team Member': [2],
        'Organization Member': [1],
      },
    });

    mockAnsibleService.listSystemUsers.mockResolvedValue([
      {
        id: 1,
        url: 'https://rhaap.test/api/v2/users/1/',
        username: 'team_user1',
        email: 'teamuser1@test.com',
        first_name: 'TeamUser1',
        last_name: 'Last1',
        is_superuser: false,
      },
      {
        id: 2,
        url: 'https://rhaap.test/api/v2/users/2/',
        username: 'team_user2',
        email: 'teamuser2@test.com',
        first_name: 'TeamUser2',
        last_name: 'Last2',
        is_superuser: false,
      },
    ]);

    mockAnsibleService.getTeamsByUserId.mockImplementation(
      (_userId: number) => {
        if (_userId === 1) {
          return Promise.resolve([
            {
              name: 'Team A',
              groupName: 'team-a',
              id: 1,
              orgId: 1,
              orgName: 'Default',
            },
            {
              name: 'Team B',
              groupName: 'team-b',
              id: 2,
              orgId: 1,
              orgName: 'Default',
            },
          ]);
        }
        if (_userId === 2) {
          return Promise.resolve([
            {
              name: 'Team B',
              groupName: 'team-b',
              id: 2,
              orgId: 1,
              orgName: 'Default',
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    const schedule = new PersistingTaskRunner();
    const entityProviderConnection: EntityProviderConnection = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    schedulingConfig.schedule = schedule;
    const provider = AAPEntityProvider.fromConfig(config, mockAnsibleService, {
      ...schedulingConfig,
      logger,
    })[0];

    expect(provider.getProviderName()).toEqual('AapEntityProvider:development');

    try {
      await provider.connect(entityProviderConnection);
    } catch (error) {
      console.error('Error during provider connection:', error);
    }

    const taskDef = schedule.getTasks()[0];
    expect(taskDef.id).toEqual('AapEntityProvider:development:run');

    await (taskDef.fn as () => Promise<void>)();

    expect(entityProviderConnection.applyMutation).toHaveBeenCalledWith({
      type: 'full',
      entities: expectedEntities,
    });
    return true;
  };

  it('test', async () => {
    const result = await expectMutation();
    expect(result).toBe(true);
  });

  describe('createSingleUser', () => {
    let provider: AAPEntityProvider;
    let mockConnection: EntityProviderConnection;

    beforeEach(() => {
      const config = new ConfigReader(MOCK_CONFIG.data);
      const logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();

      provider = AAPEntityProvider.fromConfig(config, mockAnsibleService, {
        schedule,
        logger,
      })[0];

      mockConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      provider.connect(mockConnection);
    });

    it('should successfully create user in configured organization', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([
        {
          name: 'Team A',
          groupName: 'team-a',
          id: 1,
          orgId: 1,
          orgName: 'Default',
        },
      ]);

      const result = await provider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(mockAnsibleService.getOrgsByUserId).toHaveBeenCalledWith(userID);
      expect(mockAnsibleService.getUserInfoById).toHaveBeenCalledWith(userID);
      expect(mockAnsibleService.getTeamsByUserId).toHaveBeenCalledWith(userID);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: expect.objectContaining({
              kind: 'User',
              metadata: expect.objectContaining({
                name: 'testuser',
              }),
              spec: expect.objectContaining({
                memberOf: ['Team A', 'default'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });

    it('should successfully create superuser not in configured organizations', async () => {
      const username = 'admin';
      const userID = 456;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Other Org', groupName: 'other-org' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 456,
        username: 'admin',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        is_superuser: true,
        is_orguser: false,
        url: 'https://test.example.com/users/456',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([]);

      // Mock the listSystemUsers call for aap-admins group creation
      mockAnsibleService.listSystemUsers.mockResolvedValue([
        {
          id: 456,
          username: 'admin',
          email: 'admin@example.com',
          first_name: 'Admin',
          last_name: 'User',
          is_superuser: true,
          is_orguser: false,
          url: 'https://test.example.com/users/456',
        },
      ]);

      const result = await provider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: expect.arrayContaining([
          {
            entity: expect.objectContaining({
              kind: 'User',
              metadata: expect.objectContaining({
                name: 'admin',
              }),
              spec: expect.objectContaining({
                memberOf: ['aap-admins'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
          {
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'aap-admins',
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ]),
        removed: [],
      });
    });

    it('should fail when connection is not initialized', async () => {
      const uninitializedProvider = AAPEntityProvider.fromConfig(
        new ConfigReader(MOCK_CONFIG.data),
        mockAnsibleService,
        {
          schedule: new PersistingTaskRunner(),
          logger: mockServices.logger.mock(),
        },
      )[0];

      await expect(
        uninitializedProvider.createSingleUser('testuser', 123),
      ).rejects.toThrow('Not initialized');
    });

    it('should fail when user details cannot be fetched', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockRejectedValue(
        new Error('User not found in AAP'),
      );

      await expect(provider.createSingleUser(username, userID)).rejects.toThrow(
        'Failed to fetch user details for testuser (ID: 123): User not found in AAP',
      );
    });

    it('should fail when user has invalid username', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: '',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      await expect(provider.createSingleUser(username, userID)).rejects.toThrow(
        "User testuser (ID: 123) has invalid username: ''",
      );
    });

    it('should fail when user is not in configured organizations and not superuser', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Other Org', groupName: 'other-org' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      await expect(provider.createSingleUser(username, userID)).rejects.toThrow(
        'User testuser (ID: 123) does not belong to any configured organizations: default, is not a member of any teams in those organizations, and is not a system user.',
      );
    });

    it('should handle user with no teams', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([]);

      const result = await provider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: expect.objectContaining({
              spec: expect.objectContaining({
                memberOf: ['default'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });

    it('should filter teams by configured organizations', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([
        {
          name: 'Team A',
          groupName: 'team-a',
          id: 1,
          orgId: 1,
          orgName: 'Default',
        },
        {
          name: 'Team B',
          groupName: 'team-b',
          id: 2,
          orgId: 2,
          orgName: 'Other Org',
        },
      ]);

      const result = await provider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: expect.objectContaining({
              spec: expect.objectContaining({
                memberOf: ['Team A', 'default'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });

    it('should handle case-insensitive organization matching', async () => {
      const username = 'testuser';
      const userID = 123;

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'DEFAULT', groupName: 'default' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
        is_orguser: true,
        url: 'https://test.example.com/users/123',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([]);

      const result = await provider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: expect.objectContaining({
              spec: expect.objectContaining({
                memberOf: ['default'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });

    it('should create user when user has teams in configured organizations but not direct org membership', async () => {
      const username = 'teamuser';
      const userID = 123;
      const teamMockLogger = mockServices.logger.mock();
      const teamMockConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Other Org', groupName: 'other-org' },
      ]);

      mockAnsibleService.getUserInfoById.mockResolvedValue({
        id: 123,
        username: 'teamuser',
        email: 'teamuser@example.com',
        first_name: 'Team',
        last_name: 'User',
        is_superuser: false,
        url: 'http://example.com/users/123',
      });

      mockAnsibleService.getTeamsByUserId.mockResolvedValue([
        {
          name: 'Team A',
          groupName: 'team-a',
          id: 1,
          orgId: 1,
          orgName: 'Default',
        },
        {
          name: 'Team B',
          groupName: 'team-b',
          id: 2,
          orgId: 2,
          orgName: 'Other Org',
        },
      ]);

      const teamProvider = AAPEntityProvider.fromConfig(
        new ConfigReader(MOCK_CONFIG.data),
        mockAnsibleService,
        {
          schedule: new PersistingTaskRunner(),
          logger: teamMockLogger,
        },
      )[0];

      teamProvider.connect(teamMockConnection);

      const result = await teamProvider.createSingleUser(username, userID);

      expect(result).toBe(true);
      expect(teamMockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: expect.objectContaining({
              spec: expect.objectContaining({
                memberOf: ['Team A'],
              }),
            }),
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });
  });

  describe('registerExecutionEnvironment', () => {
    let provider: AAPEntityProvider;
    let mockConnection: EntityProviderConnection;
    let logger: ReturnType<typeof mockServices.logger.mock>;
    let executionEnvironmentEntity: any;

    beforeEach(() => {
      const config = new ConfigReader(MOCK_CONFIG.data);
      logger = mockServices.logger.mock();
      const schedule = new PersistingTaskRunner();
      executionEnvironmentEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
          title: 'test-ee',
          description: 'test-ee',
          tags: ['test-ee'],
          annotations: {
            'backstage.io/managed-by-location': `url:127.0.0.1`,
            'backstage.io/managed-by-origin-location': `url:127.0.0.1`,
            'ansible.io/download-experience': 'true',
          },
        },
        spec: {
          type: 'execution-environment',
          lifecycle: 'production',
          owner: 'team-a',
          definition: 'sample \ntest-ee \ndefinition',
          readme: 'sample \ntest-ee \nreadme',
        },
      };

      provider = AAPEntityProvider.fromConfig(config, mockAnsibleService, {
        schedule,
        logger,
      })[0];

      mockConnection = {
        applyMutation: jest.fn().mockResolvedValue(undefined),
        refresh: jest.fn(),
      };

      provider.connect(mockConnection);
    });

    it('should successfully register an execution environment entity', async () => {
      await provider.registerExecutionEnvironment(executionEnvironmentEntity);

      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: executionEnvironmentEntity,
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });

    it('should raise error if entity has missing metadata name', async () => {
      // remove metadata.name from executionEnvironmentEntity
      delete executionEnvironmentEntity.metadata.name;
      await expect(
        provider.registerExecutionEnvironment(executionEnvironmentEntity),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should raise error if EEentity has no type', async () => {
      // remove metadata.name from executionEnvironmentEntity
      delete executionEnvironmentEntity.spec.type;
      await expect(
        provider.registerExecutionEnvironment(executionEnvironmentEntity),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should raise error if EEentity has incorrect type', async () => {
      // remove metadata.name from executionEnvironmentEntity
      executionEnvironmentEntity.spec.type = 'not-an-execution-environment';
      await expect(
        provider.registerExecutionEnvironment(executionEnvironmentEntity),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should throw error when connection is not initialized', async () => {
      const uninitializedProvider = AAPEntityProvider.fromConfig(
        new ConfigReader(MOCK_CONFIG.data),
        mockAnsibleService,
        {
          schedule: new PersistingTaskRunner(),
          logger: mockServices.logger.mock(),
        },
      )[0];
      await expect(
        uninitializedProvider.registerExecutionEnvironment(
          executionEnvironmentEntity,
        ),
      ).rejects.toThrow('AAPEntityProvider is not connected yet');
    });

    it('should register entity with correct locationKey', async () => {
      await provider.registerExecutionEnvironment(executionEnvironmentEntity);

      expect(mockConnection.applyMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          added: expect.arrayContaining([
            expect.objectContaining({
              locationKey: 'AapEntityProvider:development',
            }),
          ]),
        }),
      );
    });

    it('should register multiple entities independently', async () => {
      const entity1 = JSON.parse(JSON.stringify(executionEnvironmentEntity));
      const entity2 = JSON.parse(JSON.stringify(executionEnvironmentEntity));
      entity1.metadata.name = 'entity1';
      entity2.metadata.name = 'entity2';

      await provider.registerExecutionEnvironment(entity1);
      await provider.registerExecutionEnvironment(entity2);

      expect(mockConnection.applyMutation).toHaveBeenCalledTimes(2);
      expect(mockConnection.applyMutation).toHaveBeenNthCalledWith(1, {
        type: 'delta',
        added: [
          {
            entity: entity1,
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
      expect(mockConnection.applyMutation).toHaveBeenNthCalledWith(2, {
        type: 'delta',
        added: [
          {
            entity: entity2,
            locationKey: 'AapEntityProvider:development',
          },
        ],
        removed: [],
      });
    });
  });

  it('handles errors gracefully', async () => {
    const config = new ConfigReader(MOCK_CONFIG.data);
    const logger = mockServices.logger.mock();
    const schedule = new PersistingTaskRunner();

    mockAnsibleService.getOrganizations.mockRejectedValue(
      new Error('Test error'),
    );
    mockAnsibleService.getUserRoleAssignments.mockRejectedValue(
      new Error('Test error'),
    );
    mockAnsibleService.listSystemUsers.mockRejectedValue(
      new Error('Test error'),
    );
    mockAnsibleService.getTeamsByUserId.mockRejectedValue(
      new Error('Test error'),
    );

    const provider = AAPEntityProvider.fromConfig(config, mockAnsibleService, {
      schedule,
      logger,
    })[0];

    const entityProviderConnection: EntityProviderConnection = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    await provider.connect(entityProviderConnection);

    const taskDef = schedule.getTasks()[0];
    await (taskDef.fn as () => Promise<void>)();

    expect(entityProviderConnection.applyMutation).not.toHaveBeenCalled();
  });
});
