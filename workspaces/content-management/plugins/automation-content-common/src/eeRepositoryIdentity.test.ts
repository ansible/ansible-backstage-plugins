import { EE_REPOSITORY_ENTITY_REF_PATTERN } from './eeRepository';
import { eeRepositoryEntityRef } from './eeRepositoryIdentity';

describe('EE repository identity', () => {
  it('has a stable, catalog-legal reference for a registry and path', () => {
    const ref = eeRepositoryEntityRef('local', 'org/image');
    expect(ref).toMatch(EE_REPOSITORY_ENTITY_REF_PATTERN);
    expect(ref).toBe(eeRepositoryEntityRef('local', 'org/image'));
    expect(ref).not.toBe(eeRepositoryEntityRef('remote', 'org/image'));
    expect(ref).not.toBe(eeRepositoryEntityRef('local', 'org-image'));
    expect(eeRepositoryEntityRef('a/b', 'c')).not.toBe(
      eeRepositoryEntityRef('a', 'b/c'),
    );
  });
});
