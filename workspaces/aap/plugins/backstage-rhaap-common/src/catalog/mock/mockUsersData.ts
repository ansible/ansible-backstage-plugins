export const MOCK_USERS_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 2,
      next: null,
      previous: null,
      results: [
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
      ],
    }),
};
