export const MOCK_USERS_ORG_RESPONSE_1 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          name: 'Default',
          groupName: 'default',
        },
        {
          name: 'Test organization',
          groupName: 'test-organization',
        },
      ],
    }),
};

export const MOCK_USERS_ORG_RESPONSE_2 = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          name: 'Default',
          groupName: 'default',
        },
      ],
    }),
};
