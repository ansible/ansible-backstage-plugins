import {
  REPO_TOOLTIP,
  REPO_DESCRIPTION,
  COLUMN_SOURCE_TOOLTIP,
  COLUMN_LAST_ACTIVITY_TOOLTIP,
  COLUMN_CONTAINS_TOOLTIP,
  COLUMN_LAST_SYNC_TOOLTIP,
} from './constants';

describe('GitRepositories constants', () => {
  it('exports REPO_TOOLTIP', () => {
    expect(REPO_TOOLTIP).toBeDefined();
    expect(typeof REPO_TOOLTIP).toBe('string');
    expect(REPO_TOOLTIP.length).toBeGreaterThan(0);
  });

  it('exports REPO_DESCRIPTION', () => {
    expect(REPO_DESCRIPTION).toBeDefined();
    expect(typeof REPO_DESCRIPTION).toBe('string');
    expect(REPO_DESCRIPTION.length).toBeGreaterThan(0);
  });

  it('exports COLUMN_SOURCE_TOOLTIP', () => {
    expect(COLUMN_SOURCE_TOOLTIP).toBeDefined();
    expect(typeof COLUMN_SOURCE_TOOLTIP).toBe('string');
    expect(COLUMN_SOURCE_TOOLTIP).toContain('SCM provider');
  });

  it('exports COLUMN_LAST_ACTIVITY_TOOLTIP', () => {
    expect(COLUMN_LAST_ACTIVITY_TOOLTIP).toBeDefined();
    expect(typeof COLUMN_LAST_ACTIVITY_TOOLTIP).toBe('string');
    expect(COLUMN_LAST_ACTIVITY_TOOLTIP).toContain('CI');
  });

  it('exports COLUMN_CONTAINS_TOOLTIP', () => {
    expect(COLUMN_CONTAINS_TOOLTIP).toBeDefined();
    expect(typeof COLUMN_CONTAINS_TOOLTIP).toBe('string');
    expect(COLUMN_CONTAINS_TOOLTIP).toContain('collections');
  });

  it('exports COLUMN_LAST_SYNC_TOOLTIP', () => {
    expect(COLUMN_LAST_SYNC_TOOLTIP).toBeDefined();
    expect(typeof COLUMN_LAST_SYNC_TOOLTIP).toBe('string');
    expect(COLUMN_LAST_SYNC_TOOLTIP).toContain('synced');
  });
});
