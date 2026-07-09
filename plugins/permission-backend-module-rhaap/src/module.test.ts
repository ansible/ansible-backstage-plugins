import { AAPRBACProvider, formatNamespace, readOrgs } from './module';
import type { RBACProviderConnection } from '@backstage-community/plugin-rbac-node';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

function createMockConnection(): jest.Mocked<RBACProviderConnection> {
  return {
    applyRoles: jest.fn(),
    applyPermissions: jest.fn(),
    applyConditionalPermissions: jest.fn(),
  };
}

describe('AAPRBACProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProviderName', () => {
    it('should return aap-rbac-provider', () => {
      const provider = new AAPRBACProvider([], mockLogger as any);
      expect(provider.getProviderName()).toBe('aap-rbac-provider');
    });
  });

  describe('connect — no orgs', () => {
    it('should skip RBAC policy creation for empty orgs', async () => {
      const provider = new AAPRBACProvider([], mockLogger as any);
      const connection = createMockConnection();

      await provider.connect(connection);

      expect(connection.applyRoles).not.toHaveBeenCalled();
      expect(connection.applyPermissions).not.toHaveBeenCalled();
      expect(connection.applyConditionalPermissions).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('skipping RBAC policy creation'),
      );
    });
  });

  describe('connect — single-org', () => {
    it('should create RBAC policy for single-org', async () => {
      const provider = new AAPRBACProvider(['Default'], mockLogger as any);
      const connection = createMockConnection();

      await provider.connect(connection);

      expect(connection.applyRoles).toHaveBeenCalledWith([
        ['group:default/default', 'role:default/aap-user'],
        ['group:default/aap-admins', 'role:default/aap-user'],
      ]);
      expect(connection.applyPermissions).toHaveBeenCalled();
      expect(connection.applyConditionalPermissions).toHaveBeenCalled();
    });
  });

  describe('connect — multi-org', () => {
    it('should create role with org group members', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Engineering', 'SecOps'],
        mockLogger as any,
      );
      const connection = createMockConnection();

      await provider.connect(connection);

      expect(connection.applyRoles).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['group:default/default', 'role:default/aap-user'],
          ['group:engineering/engineering', 'role:default/aap-user'],
          ['group:secops/secops', 'role:default/aap-user'],
          ['group:default/aap-admins', 'role:default/aap-user'],
        ]),
      );
    });

    it('should create permissions for aap-user role', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Engineering'],
        mockLogger as any,
      );
      const connection = createMockConnection();

      await provider.connect(connection);

      const permissions = connection.applyPermissions.mock.calls[0][0];
      expect(permissions).toEqual(
        expect.arrayContaining([
          [
            'role:default/aap-user',
            'catalog-entity',
            'read',
            'allow',
          ],
          [
            'role:default/aap-user',
            'ansible.templates.view',
            'use',
            'allow',
          ],
          [
            'role:default/aap-user',
            'ansible.history.view',
            'use',
            'allow',
          ],
        ]),
      );
    });

    it('should create conditional policy with HAS_EXECUTE_PERMISSION', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Engineering'],
        mockLogger as any,
      );
      const connection = createMockConnection();

      await provider.connect(connection);

      const policies =
        connection.applyConditionalPermissions.mock.calls[0][0];
      expect(policies).toHaveLength(1);
      expect(policies[0].roleEntityRef).toBe('role:default/aap-user');
      expect((policies[0].conditions as any).anyOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: 'HAS_EXECUTE_PERMISSION',
            params: { userEntityRef: '$currentUser' },
          }),
          expect.objectContaining({
            not: expect.objectContaining({
              rule: 'HAS_METADATA',
              params: { key: 'aapJobTemplateId' },
            }),
          }),
        ]),
      );
    });

    it('should map Default org to default namespace', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Other'],
        mockLogger as any,
      );
      const connection = createMockConnection();

      await provider.connect(connection);

      const roles = connection.applyRoles.mock.calls[0][0];
      const defaultRole = roles.find((r: string[]) =>
        r[0] === 'group:default/default',
      );
      expect(defaultRole).toEqual([
        'group:default/default',
        'role:default/aap-user',
      ]);
    });
  });

  describe('refresh', () => {
    it('should be a no-op for no orgs', async () => {
      const provider = new AAPRBACProvider([], mockLogger as any);
      const connection = createMockConnection();
      await provider.connect(connection);

      await provider.refresh();

      expect(connection.applyRoles).not.toHaveBeenCalled();
    });

    it('should be a no-op for configured orgs (create-if-missing)', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Engineering'],
        mockLogger as any,
      );
      const connection = createMockConnection();
      await provider.connect(connection);

      jest.clearAllMocks();
      await provider.refresh();

      expect(connection.applyRoles).not.toHaveBeenCalled();
      expect(connection.applyPermissions).not.toHaveBeenCalled();
    });
  });

  describe('connect — permissions', () => {
    it('should include scaffolder and ansible sidebar permissions', async () => {
      const provider = new AAPRBACProvider(
        ['Default', 'Engineering'],
        mockLogger as any,
      );
      const connection = createMockConnection();

      await provider.connect(connection);

      const permissions = connection.applyPermissions.mock.calls[0][0];
      expect(permissions).toHaveLength(9);
      expect(permissions).toEqual(
        expect.arrayContaining([
          ['role:default/aap-user', 'scaffolder-action', 'use', 'allow'],
          ['role:default/aap-user', 'scaffolder-task', 'use', 'allow'],
          ['role:default/aap-user', 'scaffolder.task.create', 'create', 'allow'],
        ]),
      );
    });
  });
});

describe('formatNamespace', () => {
  it('should lowercase and strip special characters', () => {
    expect(formatNamespace('My Org Name')).toBe('my-org-name');
  });

  it('should replace multiple hyphens with single', () => {
    expect(formatNamespace('org--name')).toBe('org-name');
  });

  it('should strip leading and trailing hyphens', () => {
    expect(formatNamespace('-org-name-')).toBe('org-name');
  });

  it('should truncate to 63 characters', () => {
    const longName = 'a'.repeat(100);
    expect(formatNamespace(longName).length).toBeLessThanOrEqual(63);
  });

  it('should handle underscores', () => {
    expect(formatNamespace('my_org')).toBe('my-org');
  });
});

describe('readOrgs', () => {
  it('should return empty array when orgs not configured', () => {
    const config = {
      has: () => false,
      getString: jest.fn(),
      getStringArray: jest.fn(),
    };
    expect(readOrgs(config)).toEqual([]);
  });

  it('should parse comma-separated string', () => {
    const config = {
      has: () => true,
      getString: () => 'Default, Engineering, SecOps',
      getStringArray: jest.fn(),
    };
    expect(readOrgs(config)).toEqual(['Default', 'Engineering', 'SecOps']);
  });

  it('should fall back to string array', () => {
    const config = {
      has: () => true,
      getString: () => {
        throw new Error('not a string');
      },
      getStringArray: () => ['Default', 'Engineering'],
    };
    expect(readOrgs(config)).toEqual(['Default', 'Engineering']);
  });

  it('should filter empty entries', () => {
    const config = {
      has: () => true,
      getString: () => 'Default, , Engineering, ',
      getStringArray: jest.fn(),
    };
    expect(readOrgs(config)).toEqual(['Default', 'Engineering']);
  });

  it('should trim whitespace', () => {
    const config = {
      has: () => true,
      getString: () => '  Default ,  Engineering  ',
      getStringArray: jest.fn(),
    };
    expect(readOrgs(config)).toEqual(['Default', 'Engineering']);
  });
});
