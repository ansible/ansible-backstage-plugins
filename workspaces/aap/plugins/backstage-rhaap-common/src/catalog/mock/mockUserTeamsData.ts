export const MOCK_USER_TEAM_RESPONSE_1 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          name: 'Team A',
          groupName: 'team-a',
          id: 1,
          orgId: 1,
        },
        {
          name: 'team B',
          groupName: 'team-b',
          id: 2,
          orgId: 1,
        },
      ],
    }),
};

export const MOCK_USER_TEAM_RESPONSE_2 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          name: 'Team B',
          groupName: 'team-b',
          id: 2,
          orgId: 1,
        },
      ],
    }),
};
