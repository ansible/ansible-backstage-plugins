export const MOCK_ROLE_ASSIGNMENT_RESPONSE = {
  ok: true,
  json: () =>
    Promise.resolve({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          user: 1,
          object_id: 1,
          summary_fields: {
            role_definition: {
              id: 2,
              name: 'Team Member',
            },
          },
        },
        {
          id: 1,
          user: 1,
          object_id: 2,
          summary_fields: {
            role_definition: {
              id: 2,
              name: 'Team Member',
            },
          },
        },
        {
          id: 1,
          user: 1,
          object_id: 3,
          summary_fields: {
            role_definition: {
              id: 2,
              name: 'Team Member',
            },
          },
        },

        {
          id: 1,
          user: 1,
          object_id: 1,
          summary_fields: {
            role_definition: {
              id: 5,
              name: 'Organization Member',
            },
          },
        },
        {
          id: 1,
          user: 1,
          object_id: 2,
          summary_fields: {
            role_definition: {
              id: 5,
              name: 'Organization Member',
            },
          },
        },
        {
          id: 1,
          user: 2,
          object_id: 1,
          summary_fields: {
            role_definition: {
              id: 2,
              name: 'Team Member',
            },
          },
        },
        {
          id: 1,
          user: 2,
          object_id: 1,
          summary_fields: {
            role_definition: {
              id: 5,
              name: 'Organization Member',
            },
          },
        },
      ],
    }),
};
