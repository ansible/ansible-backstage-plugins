import { AnsibleApi } from '../apis';

export const mockAnsibleApi: jest.Mocked<AnsibleApi> = {
  ...jest.requireActual<AnsibleApi>('../apis'),
  syncTemplates: jest.fn(),
  syncOrgsUsersTeam: jest.fn(),
  getUserJobTemplates: jest.fn().mockResolvedValue({
    items: [
      { id: 1, name: 'Template 1' },
      { id: 2, name: 'Template 2' },
    ],
  }),
  getSyncStatus: jest.fn(),
} as any;

export const mockRhAapAuthApi: jest.Mocked<any> = {
  ...jest.requireActual<any>('../apis'),
  getAccessToken: jest.fn().mockResolvedValue('mock-token'),
  getUser: jest.fn(),
  getUserInfo: jest.fn(),
} as any;
