export const MOCK_ORGANIZATION_DETAILS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: 'Default',
          namespace: 'default',
          related: {
            teams: '/api/gateway/v1/teams/',
            users: '/api/gateway/v1/users/',
          },
        },
      ],
    }),
};

export const MOCK_ORG_TEAMS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      results: [
        {
          id: 1,
          organization: 1,
          name: 'Team A',
          groupName: 'team-a',
          description: 'Team A description',
          related: {
            users: '/api/gateway/v1/teams/1/users',
          },
        },
        {
          id: 2,
          organization: 1,
          name: 'Team B',
          groupName: 'team-b',
          description: 'Team B description',
        },
      ],
    }),
};

export const MOCK_ORG_USERS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      results: [
        {
          id: 1,
          username: 'user1',
          email: 'user1@test.com',
          first_name: 'User1',
          last_name: 'Last1',
          is_superuser: false,
          is_orguser: false,
        },
        {
          id: 2,
          username: 'user2',
          email: 'user2@test.com',
          first_name: 'User2',
          last_name: 'Last2',
          is_superuser: false,
        },
      ],
    }),
};

export const MOCK_ORG_TEAM_USERS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      results: [
        {
          id: 1,
          username: 'team_user1',
          email: 'teamuser1@test.com',
          first_name: 'TeamUser1',
          last_name: 'Last1',
          is_superuser: false,
        },
        {
          id: 2,
          username: 'team_user2',
          email: 'teamuser2@test.com',
          first_name: 'TeamUser2',
          last_name: 'Last2',
          is_superuser: false,
        },
      ],
    }),
};
