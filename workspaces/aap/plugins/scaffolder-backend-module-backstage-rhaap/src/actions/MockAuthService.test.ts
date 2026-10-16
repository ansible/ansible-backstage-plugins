import { MockAuthService } from './MockAuthService';
import {
  mockCredentials,
  MOCK_USER_TOKEN,
  MOCK_SERVICE_TOKEN,
  MOCK_INVALID_USER_TOKEN,
  MOCK_INVALID_SERVICE_TOKEN,
  MOCK_USER_TOKEN_PREFIX,
} from './mockCredentials';
import { AuthenticationError } from '@backstage/errors';

describe('MockAuthService', () => {
  const pluginId = 'test-plugin';
  const service = new MockAuthService({
    pluginId,
    disableDefaultAuthPolicy: false,
  });

  describe('authenticate', () => {
    it('returns user credentials for MOCK_USER_TOKEN', async () => {
      const creds = await service.authenticate(MOCK_USER_TOKEN);
      expect(creds).toEqual(mockCredentials.user());
    });

    it('returns service credentials for MOCK_SERVICE_TOKEN', async () => {
      const creds = await service.authenticate(MOCK_SERVICE_TOKEN);
      expect(creds).toEqual(mockCredentials.service());
    });

    it('throws AuthenticationError for invalid tokens', async () => {
      await expect(
        service.authenticate(MOCK_INVALID_USER_TOKEN),
      ).rejects.toThrow(AuthenticationError);
      await expect(
        service.authenticate(MOCK_INVALID_SERVICE_TOKEN),
      ).rejects.toThrow(AuthenticationError);
    });

    it('parses prefixed user tokens correctly', async () => {
      const token =
        MOCK_USER_TOKEN_PREFIX + JSON.stringify({ sub: 'user:default/test' });
      const creds = await service.authenticate(token);
      expect(creds).toEqual(mockCredentials.user('user:default/test'));
    });
  });

  describe('getNoneCredentials', () => {
    it('returns none credentials', async () => {
      const creds = await service.getNoneCredentials();
      expect(creds).toEqual(mockCredentials.none());
    });
  });

  describe('getOwnServiceCredentials', () => {
    it('returns service credentials for plugin', async () => {
      const creds = await service.getOwnServiceCredentials();
      expect(creds).toEqual(mockCredentials.service(`plugin:${pluginId}`));
    });
  });

  describe('isPrincipal', () => {
    it('detects user principal correctly', () => {
      const creds = mockCredentials.user();
      expect(service.isPrincipal(creds, 'user')).toBe(true);
      expect(service.isPrincipal(creds, 'service')).toBe(false);
    });

    it('detects service principal correctly', () => {
      const creds = mockCredentials.service();
      expect(service.isPrincipal(creds, 'service')).toBe(true);
      expect(service.isPrincipal(creds, 'user')).toBe(false);
    });

    it('returns true for unknown type', () => {
      const creds = mockCredentials.user();
      expect(service.isPrincipal(creds, 'unknown')).toBe(true);
    });
  });

  describe('getPluginRequestToken', () => {
    it('returns a service token for user principal', async () => {
      const tokenObj = await service.getPluginRequestToken({
        onBehalfOf: mockCredentials.user(),
        targetPluginId: 'some-plugin',
      });
      expect(tokenObj.token).toBeDefined();
    });

    it('returns empty token for none principal with disableDefaultAuthPolicy', async () => {
      const s = new MockAuthService({
        pluginId,
        disableDefaultAuthPolicy: true,
      });
      const tokenObj = await s.getPluginRequestToken({
        onBehalfOf: mockCredentials.none(),
        targetPluginId: 'some-plugin',
      });
      expect(tokenObj.token).toBe('');
    });

    it('throws for unknown principal type', async () => {
      await expect(
        service.getPluginRequestToken({
          onBehalfOf: { principal: { type: 'other' } } as any,
          targetPluginId: 'some-plugin',
        }),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getLimitedUserToken', () => {
    it('returns limited token for user principal', async () => {
      const creds = mockCredentials.user();
      const result = await service.getLimitedUserToken(creds);
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws for non-user principal', async () => {
      const creds = mockCredentials.service();
      await expect(service.getLimitedUserToken(creds as any)).rejects.toThrow(
        AuthenticationError,
      );
    });
  });
});
