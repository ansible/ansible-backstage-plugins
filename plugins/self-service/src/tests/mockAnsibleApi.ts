import { AnsibleApi } from '../apis';

export const mockAnsibleApi: jest.Mocked<AnsibleApi> = {
  ...jest.requireActual<AnsibleApi>('../apis'),
  syncTemplates: jest.fn(),
  syncOrgsUsersTeam: jest.fn(),
  getSyncStatus: jest.fn(),
} as any;

export const mockRhAapAuthApi: jest.Mocked<any> = {
  ...jest.requireActual<any>('../apis'),
  getAccessToken: jest.fn().mockResolvedValue('mock-token'),
  getUser: jest.fn(),
  getUserInfo: jest.fn(),
} as any;
