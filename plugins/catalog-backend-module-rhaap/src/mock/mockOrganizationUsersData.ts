export const MOCK_ORGANIZATION_USERS_RESPONSE_1 = {
  ok: true,
  json: async () => ({
    count: 2,
    next: null,
    previous: null,
    results: [
      {
        username: 'user1',
      },
      {
        username: 'user2',
      },
    ],
  }),
};

export const MOCK_ORGANIZATION_USERS_RESPONSE_2 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          username: 'user1',
        },
      ],
    }),
};
