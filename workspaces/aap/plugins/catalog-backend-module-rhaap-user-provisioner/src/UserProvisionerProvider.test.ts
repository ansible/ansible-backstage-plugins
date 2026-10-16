import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import { UserProvisionerProvider } from './UserProvisionerProvider';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_BASE_URL = 'https://aap.test';

const MOCK_CONFIG = new ConfigReader({
  ansible: {
    rhaap: {
      baseUrl: MOCK_BASE_URL,
      token: 'test-token',
      checkSSL: false,
    },
  },
  catalog: {
    providers: {
      rhaap: {
        development: {
          orgs: 'Default',
        },
      },
    },
  },
});

const MOCK_USER = {
  id: 42,
  username: 'jdoe',
  first_name: 'John',
  last_name: 'Doe',
  email: 'jdoe@example.com',
  is_superuser: false,
  is_system_auditor: false,
  is_orguser: true,
  url: `${MOCK_BASE_URL}/users/42`,
};

const MOCK_SUPERUSER = {
  ...MOCK_USER,
  id: 1,
  username: 'admin',
  is_superuser: true,
};

const MOCK_ORGS = [{ name: 'Default', id: 1, groupName: 'default' }];
const MOCK_TEAMS = [
  {
    name: 'ops-team',
    groupName: 'ops-team',
    id: 10,
    orgId: 1,
    orgName: 'Default',
  },
];

function makeMockAnsibleService(
  overrides: Partial<jest.Mocked<IAAPService>> = {},
): jest.Mocked<IAAPService> {
  return {
    getUserInfoById: jest.fn().mockResolvedValue(MOCK_USER),
    getOrgsByUserId: jest.fn().mockResolvedValue(MOCK_ORGS),
    getTeamsByUserId: jest.fn().mockResolvedValue(MOCK_TEAMS),
    listSystemUsers: jest.fn().mockResolvedValue([MOCK_USER]),
    // stubs for the rest of the interface
    executePostRequest: jest.fn(),
    executeGetRequest: jest.fn(),
    executeDeleteRequest: jest.fn(),
    getProject: jest.fn(),
    deleteProject: jest.fn(),
    deleteProjectIfExists: jest.fn(),
    createProject: jest.fn(),
    deleteExecutionEnvironmentExists: jest.fn(),
    createExecutionEnvironment: jest.fn(),
    deleteExecutionEnvironment: jest.fn(),
    deleteJobTemplate: jest.fn(),
    deleteJobTemplateIfExists: jest.fn(),
    createJobTemplate: jest.fn(),
    fetchEvents: jest.fn(),
    fetchResult: jest.fn(),
    launchJobTemplate: jest.fn(),
    launchJobTemplateNoWait: jest.fn(),
    getJobStatus: jest.fn(),
    cancelJob: jest.fn(),
    cleanUp: jest.fn(),
    checkControllerAvailability: jest.fn(),
    getResourceData: jest.fn(),
    getJobTemplatesByName: jest.fn(),
    setLogger: jest.fn(),
    rhAAPAuthenticate: jest.fn(),
    rhAAPRevokeToken: jest.fn(),
    fetchProfile: jest.fn(),
    getOrganizations: jest.fn(),
    getUserRoleAssignments: jest.fn(),
    syncJobTemplates: jest.fn(),
    isValidPAHRepository: jest.fn(),
    syncCollectionsByRepositories: jest.fn(),
    ...overrides,
  } as jest.Mocked<IAAPService>;
}

function makeMockConnection(): jest.Mocked<EntityProviderConnection> {
  return {
    applyMutation: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<EntityProviderConnection>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UserProvisionerProvider', () => {
  let provider: UserProvisionerProvider;
  let mockAnsibleService: jest.Mocked<IAAPService>;
  let mockConnection: jest.Mocked<EntityProviderConnection>;

  beforeEach(() => {
    mockAnsibleService = makeMockAnsibleService();
    mockConnection = makeMockConnection();
    provider = new UserProvisionerProvider({
      ansibleService: mockAnsibleService,
      config: MOCK_CONFIG,
      logger: mockServices.logger.mock(),
    });
  });

  describe('getProviderName', () => {
    it('returns the provider name', () => {
      expect(provider.getProviderName()).toBe('rhaap-user-provisioner');
    });
  });

  describe('createUser', () => {
    it('throws NotFoundError when not connected to catalog', async () => {
      await expect(provider.createUser('jdoe', 42)).rejects.toThrow(
        'UserProvisionerProvider: not connected to catalog yet',
      );
    });

    it('creates a regular user entity with org and team memberships', async () => {
      await provider.connect(mockConnection);
      const result = await provider.createUser('jdoe', 42);

      expect(result).toBe(true);
      expect(mockAnsibleService.getUserInfoById).toHaveBeenCalledWith(42);
      expect(mockAnsibleService.getOrgsByUserId).toHaveBeenCalledWith(42, [
        'default',
      ]);
      expect(mockAnsibleService.getTeamsByUserId).toHaveBeenCalledWith(42);

      expect(mockConnection.applyMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delta',
          added: expect.arrayContaining([
            expect.objectContaining({
              entity: expect.objectContaining({
                kind: 'User',
                metadata: expect.objectContaining({
                  name: 'jdoe',
                  namespace: 'default',
                }),
                spec: expect.objectContaining({
                  memberOf: expect.arrayContaining([
                    'group:default/ops-team',
                    'group:default/default',
                  ]),
                }),
              }),
              locationKey: 'rhaap-user-provisioner',
            }),
          ]),
          removed: [],
        }),
      );
    });

    it('adds aap-admins group entity when user is a superuser', async () => {
      mockAnsibleService.getUserInfoById.mockResolvedValue(MOCK_SUPERUSER);
      mockAnsibleService.listSystemUsers.mockResolvedValue([MOCK_SUPERUSER]);

      await provider.connect(mockConnection);
      const result = await provider.createUser('admin', 1);

      expect(result).toBe(true);
      expect(mockAnsibleService.listSystemUsers).toHaveBeenCalled();

      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      expect(mutationCall.added).toHaveLength(2);

      const groupEntity = mutationCall.added.find(
        (e: any) => e.entity.kind === 'Group',
      );
      expect(groupEntity).toBeDefined();
      expect(groupEntity.entity.metadata.name).toBe('aap-admins');
      expect(groupEntity.entity.spec.members).toContain('user:default/admin');
    });

    it('creates user without aap-admins entity for non-superusers', async () => {
      await provider.connect(mockConnection);
      await provider.createUser('jdoe', 42);

      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      expect(mutationCall.added).toHaveLength(1);
      expect(mutationCall.added[0].entity.kind).toBe('User');
      expect(mockAnsibleService.listSystemUsers).not.toHaveBeenCalled();
    });

    it('sets aap.platform/is_superuser annotation correctly', async () => {
      mockAnsibleService.getUserInfoById.mockResolvedValue(MOCK_SUPERUSER);
      mockAnsibleService.listSystemUsers.mockResolvedValue([MOCK_SUPERUSER]);

      await provider.connect(mockConnection);
      await provider.createUser('admin', 1);

      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      const userEntity = mutationCall.added.find(
        (e: any) => e.entity.kind === 'User',
      );
      expect(
        userEntity.entity.metadata.annotations['aap.platform/is_superuser'],
      ).toBe('true');
    });

    it('throws when AAP API calls fail', async () => {
      mockAnsibleService.getUserInfoById.mockRejectedValue(
        new Error('AAP unreachable'),
      );

      await provider.connect(mockConnection);
      await expect(provider.createUser('jdoe', 42)).rejects.toThrow(
        'Failed to fetch user details for jdoe (ID: 42): AAP unreachable',
      );
    });

    it('throws when user has an empty username in AAP response', async () => {
      mockAnsibleService.getUserInfoById.mockResolvedValue({
        ...MOCK_USER,
        username: '',
      });

      await provider.connect(mockConnection);
      await expect(provider.createUser('jdoe', 42)).rejects.toThrow(
        "User jdoe (ID: 42) has invalid username: ''",
      );
    });

    it('throws when user does not belong to any configured organization', async () => {
      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'OtherOrg', id: 3, groupName: 'otherorg' },
      ]);
      mockAnsibleService.getTeamsByUserId.mockResolvedValue([]);

      await provider.connect(mockConnection);
      await expect(provider.createUser('jdoe', 42)).rejects.toThrow(
        'does not belong to any configured organizations',
      );
    });

    it('succeeds via team membership even without direct org access', async () => {
      mockAnsibleService.getOrgsByUserId.mockResolvedValue([]);
      mockAnsibleService.getTeamsByUserId.mockResolvedValue([
        {
          name: 'ops-team',
          groupName: 'ops-team',
          id: 10,
          orgId: 1,
          orgName: 'Default',
        },
      ]);

      await provider.connect(mockConnection);
      const result = await provider.createUser('jdoe', 42);

      expect(result).toBe(true);
      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      const userEntity = mutationCall.added[0].entity;
      expect(userEntity.spec.memberOf).toContain('group:default/ops-team');
      expect(userEntity.spec.memberOf).not.toContain('group:default/default');
    });

    it('logs a warning and continues when aap-admins group update fails', async () => {
      mockAnsibleService.getUserInfoById.mockResolvedValue(MOCK_SUPERUSER);
      mockAnsibleService.listSystemUsers.mockRejectedValue(
        new Error('AAP superuser fetch failed'),
      );
      const mockLogger = mockServices.logger.mock();

      provider = new UserProvisionerProvider({
        ansibleService: mockAnsibleService,
        config: MOCK_CONFIG,
        logger: mockLogger,
      });

      await provider.connect(mockConnection);
      // Should not throw — warning is logged and user entity still created
      const result = await provider.createUser('admin', 1);

      expect(result).toBe(true);
      // Only the user entity, not aap-admins
      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      expect(mutationCall.added).toHaveLength(1);
    });
  });

  describe('multi-org config', () => {
    it('keeps single-org flag-on user and admin identities aligned with auth', async () => {
      const config = new ConfigReader({
        ansible: { rhaap: { baseUrl: MOCK_BASE_URL } },
        catalog: {
          providers: {
            rhaap: { dev: { orgs: ['Default'], multiOrgEnabled: true } },
          },
        },
      });
      mockAnsibleService.getUserInfoById.mockResolvedValue(MOCK_SUPERUSER);
      mockAnsibleService.listSystemUsers.mockResolvedValue([MOCK_SUPERUSER]);
      const idProvisioner = new UserProvisionerProvider({
        ansibleService: mockAnsibleService,
        config,
        logger: mockServices.logger.mock(),
      });
      await idProvisioner.connect(mockConnection);
      await idProvisioner.createUser('admin', 1);
      const entities =
        mockConnection.applyMutation.mock.calls[0][0].type === 'delta'
          ? (
              mockConnection.applyMutation.mock.calls[0][0] as {
                added: Array<{ entity: any }>;
              }
            ).added.map(item => item.entity)
          : [];
      expect(entities.find(item => item.kind === 'User').metadata.name).toBe(
        'aap-user-1',
      );
      expect(
        entities.find(item => item.metadata.name === 'aap-admins').spec.members,
      ).toEqual(['user:default/aap-user-1']);
    });
    it('uses org-scoped namespaces when multiple orgs are configured', async () => {
      const multiOrgConfig = new ConfigReader({
        ansible: {
          rhaap: { baseUrl: MOCK_BASE_URL, token: 't', checkSSL: false },
        },
        catalog: {
          providers: {
            rhaap: {
              development: {
                multiOrgEnabled: true,
                orgs: ['Default', 'Engineering'],
              },
            },
          },
        },
      });

      mockAnsibleService.getOrgsByUserId.mockResolvedValue([
        { name: 'Default', id: 1, groupName: 'default' },
      ]);
      mockAnsibleService.getTeamsByUserId.mockResolvedValue([]);

      const multiOrgProvider = new UserProvisionerProvider({
        ansibleService: mockAnsibleService,
        config: multiOrgConfig,
        logger: mockServices.logger.mock(),
      });

      await multiOrgProvider.connect(mockConnection);
      await multiOrgProvider.createUser('jdoe', 42);

      const mutationCall = (mockConnection.applyMutation as jest.Mock).mock
        .calls[0][0] as any;
      const userEntity = mutationCall.added[0].entity;
      expect(userEntity.spec.memberOf).toContain('group:aap-1/aap-org-1');
      expect(userEntity.metadata.namespace).toBe('default');
      expect(userEntity.metadata.name).toBe('aap-user-42');
      expect(userEntity.metadata.annotations['ansible.com/aap-user-id']).toBe(
        '42',
      );
      // org annotation should be set in multi-org mode
      expect(userEntity.metadata.annotations['ansible.com/organizations']).toBe(
        'Default',
      );
    });
  });
});
