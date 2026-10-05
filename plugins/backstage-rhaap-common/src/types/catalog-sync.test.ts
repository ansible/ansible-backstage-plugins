import { formatConflictForDisplay } from './catalog-sync';
import type { ConflictDetail } from './catalog-sync';

describe('formatConflictForDisplay', () => {
  it('should format Group entity conflicts', () => {
    const conflict: ConflictDetail = {
      key: 'Group:default/engineering',
      firstAapIds: 'ansible.com/aap-organization-id=1',
      duplicateAapIds: 'ansible.com/aap-team-id=42',
    };

    expect(formatConflictForDisplay(conflict)).toBe("Group 'engineering'");
  });

  it('should format User entity conflicts', () => {
    const conflict: ConflictDetail = {
      key: 'User:default/admin',
      firstAapIds: 'ansible.com/aap-user-id=10',
      duplicateAapIds: 'ansible.com/aap-user-id=20',
    };

    expect(formatConflictForDisplay(conflict)).toBe("User 'admin'");
  });

  it('should handle Template conflicts', () => {
    const conflict: ConflictDetail = {
      key: 'Template:default/deploy-service',
      firstAapIds: 'ansible.com/aap-job-template-id=101',
      duplicateAapIds: 'ansible.com/aap-job-template-id=102',
    };

    expect(formatConflictForDisplay(conflict)).toBe(
      "Template 'deploy-service'",
    );
  });

  it('should handle entities in non-default namespaces', () => {
    const conflict: ConflictDetail = {
      key: 'Group:production/ops-team',
      firstAapIds: 'ansible.com/aap-organization-id=5',
      duplicateAapIds: 'ansible.com/aap-team-id=99',
    };

    expect(formatConflictForDisplay(conflict)).toBe("Group 'ops-team'");
  });

  it('should return the original key when format is unexpected', () => {
    const conflict: ConflictDetail = {
      key: 'invalid-format',
      firstAapIds: 'ansible.com/aap-organization-id=1',
      duplicateAapIds: 'ansible.com/aap-team-id=42',
    };

    expect(formatConflictForDisplay(conflict)).toBe('invalid-format');
  });

  it('should handle entity names with special characters', () => {
    const conflict: ConflictDetail = {
      key: 'Group:default/platform-team-2024',
      firstAapIds: 'ansible.com/aap-organization-id=7',
      duplicateAapIds: 'ansible.com/aap-team-id=77',
    };

    expect(formatConflictForDisplay(conflict)).toBe(
      "Group 'platform-team-2024'",
    );
  });
});
