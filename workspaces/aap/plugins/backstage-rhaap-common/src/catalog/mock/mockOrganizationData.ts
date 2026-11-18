export const MOCK_ORGANIZATION_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, name: 'Default' },
        { id: 2, name: 'Test organization' },
      ],
    }),
};
