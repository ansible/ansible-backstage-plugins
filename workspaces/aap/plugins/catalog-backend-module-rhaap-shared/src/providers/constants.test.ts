import { TEAM_MEMBER, ORGANIZATION_MEMBER } from './constants';

describe('roles constants', () => {
  it('TEAM_MEMBER should have correct value', () => {
    expect(TEAM_MEMBER).toBe('Team Member');
  });

  it('ORGANIZATION_MEMBER should have correct value', () => {
    expect(ORGANIZATION_MEMBER).toBe('Organization Member');
  });
});
