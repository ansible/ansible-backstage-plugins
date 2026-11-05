import { EntityFilterQuery } from '@backstage/catalog-client';
import { buildHomeTemplateCatalogQuery } from './buildHomeTemplateQuery';
import { buildVisibilityPredicate } from './buildVisibilityPredicate';

describe('buildVisibilityPredicate', () => {
  it.each([
    {
      description: 'templates without aapJobTemplateId and allowed AAP ids',
      jobTemplateIds: [1, 2],
      expected: {
        $any: [
          { 'metadata.aapJobTemplateId': { $exists: false } },
          { 'metadata.aapJobTemplateId': { $in: ['1', '2'] } },
        ],
      },
    },
    {
      description: 'only non-AAP templates when the user has no job templates',
      jobTemplateIds: [] as number[],
      expected: {
        $any: [{ 'metadata.aapJobTemplateId': { $exists: false } }],
      },
    },
  ])('includes $description', ({ jobTemplateIds, expected }) => {
    expect(buildVisibilityPredicate(jobTemplateIds)).toEqual(expected);
  });
});

describe('buildHomeTemplateCatalogQuery', () => {
  it('merges visibility, catalog filters, and selected sources', () => {
    const query = buildHomeTemplateCatalogQuery({
      jobTemplateIds: [9],
      catalogFilter: { kind: 'template' },
      selectedSources: ['aap-template'],
    });

    expect(query).toEqual({
      $all: [
        buildVisibilityPredicate([9]),
        { kind: 'template' },
        {
          'metadata.annotations.ansible.com/template-source': {
            $in: ['aap-template'],
          },
        },
      ],
    });
  });

  it('supports array catalog filters and ignores unsupported filter values', () => {
    const query = buildHomeTemplateCatalogQuery({
      jobTemplateIds: [1],
      catalogFilter: [
        { kind: 'template', 'metadata.tags': ['ops', 'demo'] },
        { unsupported: { nested: true } },
      ] as EntityFilterQuery,
      selectedSources: [],
    });

    expect(query).toEqual({
      $all: [
        buildVisibilityPredicate([1]),
        { kind: 'template' },
        { 'metadata.tags': { $in: ['ops', 'demo'] } },
      ],
    });
  });

  it('omits source filtering when no sources are selected', () => {
    const query = buildHomeTemplateCatalogQuery({
      jobTemplateIds: [2],
      catalogFilter: { kind: 'template' },
    });

    expect(query).toEqual({
      $all: [buildVisibilityPredicate([2]), { kind: 'template' }],
    });
  });
});
