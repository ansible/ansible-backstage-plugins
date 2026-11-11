export const MOCK_TEAMS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: 'Team A',
          description: 'Team A description',
          organization: 1,
        },
        {
          id: 2,
          name: 'Team B',
          description: 'Team B description',
          organization: 1,
        },
        {
          id: 3,
          name: 'Team C',
          description: 'Team C description',
          organization: 2,
        },
      ],
    }),
};
