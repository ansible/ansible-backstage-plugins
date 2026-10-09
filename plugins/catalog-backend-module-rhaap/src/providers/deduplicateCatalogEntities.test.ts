import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import { deduplicateCatalogEntities } from './deduplicateCatalogEntities';

const makeEntity = (name: string, aapId: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Template',
  metadata: {
    name,
    namespace: 'default',
    annotations: { 'ansible.com/aap-job-template-id': aapId },
  },
});

describe('deduplicateCatalogEntities', () => {
  it('keeps the first entity and reports duplicates', () => {
    const logger = mockServices.logger.mock();
    const first = makeEntity('hello-world', '101');
    const duplicate = makeEntity('hello-world', '102');

    const result = deduplicateCatalogEntities(
      [first, duplicate],
      logger,
      'test-plugin',
    );

    expect(result.entities).toEqual([first]);
    expect(result.duplicateEntityCount).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped 1 duplicate catalog entity keys'),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate catalog entity details'),
      expect.objectContaining({
        totalConflicts: 1,
        conflicts: [
          expect.stringContaining(
            'Template:default/hello-world: first(ansible.com/aap-job-template-id=101)',
          ),
        ],
      }),
    );
  });

  it('returns the original list when keys are unique', () => {
    const logger = mockServices.logger.mock();
    const entities = [
      makeEntity('hello-world', '101'),
      makeEntity('deploy', '42'),
    ];

    const result = deduplicateCatalogEntities(entities, logger, 'test-plugin');

    expect(result.entities).toEqual(entities);
    expect(result.duplicateEntityCount).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
