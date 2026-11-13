/* eslint-disable jest/no-export -- test fixtures imported by neighboring suites. */
export const MOCK_TOKEN = 'mock-token';

export const MOCK_PROJECT = { id: 1 } as any;
export const MOCK_EXECUTION_ENVIRONMENT = { id: 1 } as any;
export const MOCK_JOB_TEMPLATE = { id: 1 } as any;

describe('AAP scaffolder test fixtures', () => {
  it('provides a non-empty mock token', () => {
    expect(MOCK_TOKEN).toBeTruthy();
  });
});
