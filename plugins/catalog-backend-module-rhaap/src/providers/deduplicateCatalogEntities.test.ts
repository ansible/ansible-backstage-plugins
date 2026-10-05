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
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      key: 'Template:default/hello-world',
      firstAapIds: 'ansible.com/aap-job-template-id=101',
      duplicateAapIds: 'ansible.com/aap-job-template-id=102',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Skipped 1 duplicate catalog entity keys.*Template:default\/hello-world: first\(ansible\.com\/aap-job-template-id=101\) duplicate\(ansible\.com\/aap-job-template-id=102\)/s,
      ),
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('truncates conflict list in warning when exceeding maxConflictDetails', () => {
    const logger = mockServices.logger.mock();
    const entities = [
      makeEntity('template-1', '1'),
      ...Array.from({ length: 12 }, (_, i) =>
        makeEntity('template-1', String(100 + i)),
      ),
    ];

    const result = deduplicateCatalogEntities(entities, logger, 'test-plugin');

    expect(result.duplicateEntityCount).toBe(12);
    expect(result.conflicts).toHaveLength(10);
    const warnCall = logger.warn.mock.calls[0][0];
    expect(warnCall).toContain('Skipped 12 duplicate catalog entity keys');
    expect(warnCall).toContain('(showing first 10)');
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
