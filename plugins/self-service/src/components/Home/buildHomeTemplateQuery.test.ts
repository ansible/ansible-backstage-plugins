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
});
