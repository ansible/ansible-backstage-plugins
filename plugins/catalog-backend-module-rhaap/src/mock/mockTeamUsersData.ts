export const MOCK_TEAM_USERS_RESPONSE_1 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [{ username: 'user1' }],
    }),
};

export const MOCK_TEAM_USERS_RESPONSE_2 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          username: 'user2',
        },
      ],
    }),
};
