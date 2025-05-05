import { AAPConnector } from './AAPConnector';
import { mockServices } from '@backstage/backend-test-utils';
import {
  MOCK_BASE_URL,
  MOCK_CHECK_SSL,
  MOCK_ORGANIZATION_RESPONSE,
  MOCK_ROLE_ASSIGNMENT_RESPONSE,
  MOCK_TEAMS_RESPONSE,
  MOCK_TOKEN,
  MOCK_USERS_RESPONSE,
} from '../mock';
import { fetch } from 'undici';

jest.mock('undici');

describe('AAP Connector', () => {
  const apiClient = new AAPConnector({
    logger: mockServices.logger.mock(),
    baseUrl: MOCK_BASE_URL,
    token: MOCK_TOKEN,
    checkSSL: MOCK_CHECK_SSL,
    orgSync: 'Default',
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('get organizations by id', async () => {
    // @ts-ignore
    fetch.mockReturnValue(Promise.resolve(MOCK_ORGANIZATION_RESPONSE));
    const result = await apiClient.getOrganizationsByID();
    expect(Object.keys(result).length).toBe(2);
    expect(result).toEqual({
      '1': { id: 1, name: 'Default', namespace: 'default' },
      '2': { id: 2, name: 'Test organization', namespace: 'test-organization' },
    });
  });

  it('get all teams by id', async () => {
    // @ts-ignore
    fetch.mockReturnValue(Promise.resolve(MOCK_TEAMS_RESPONSE));
    const result = await apiClient.getAllTeamsById();
    expect(Object.keys(result).length).toBe(3);
    expect(result).toEqual({
      '1': {
        id: 1,
        organization: 1,
        name: 'Team A',
        groupName: 'team-a',
        description: 'Team A description',
      },
      '2': {
        id: 2,
        organization: 1,
        name: 'Team B',
        groupName: 'team-b',
        description: 'Team B description',
      },
      '3': {
        id: 3,
        organization: 2,
        name: 'Team C',
        groupName: 'team-c',
        description: 'Team C description',
      },
    });
  });

  it('list users', async () => {
    // @ts-ignore
    fetch.mockReturnValue(Promise.resolve(MOCK_USERS_RESPONSE));
    const result = await apiClient.listUsers();
    expect(result).toEqual([
      {
        id: 1,
        username: 'user1',
        email: 'user1@test.com',
        first_name: 'User1 first name',
        last_name: 'User1 last name',
        is_superuser: true,
      },
      {
        id: 2,
        username: 'user2',
        email: 'user2@test.com',
        first_name: 'User2 first name',
        last_name: 'User2 last name',
        is_superuser: false,
      },
    ]);
  });

  it('get user role assignments', async () => {
    // @ts-ignore
    fetch.mockReturnValue(Promise.resolve(MOCK_ROLE_ASSIGNMENT_RESPONSE));
    const result = await apiClient.getUserRoleAssignments();
    expect(Object.keys(result).length).toBe(2);
    expect(result).toEqual({
      '1': { 'Team Member': [1, 2, 3], 'Organization Member': [1, 2] },
      '2': { 'Team Member': [1], 'Organization Member': [1] },
    });
  });

  it('should fail with wrong response', async () => {
    // @ts-ignore
    fetch.mockReturnValue(
      Promise.resolve({ ok: false, statusText: 'Something went wrong.' }),
    );
    let error;
    try {
      await apiClient.getOrganizationsByID();
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe('Something went wrong.');
  });

  it('should fail with error', async () => {
    // @ts-ignore
    fetch.mockReturnValue(Promise.reject());
    let error;
    try {
      await apiClient.getOrganizationsByID();
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).toBe(
      'Error retrieving records from https://rhaap.test/api/gateway/v1/organizations/.',
    );
  });
});
