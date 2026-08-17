import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TagFilterPicker } from './TagFilterPicker';

export const TEMPLATE_SOURCE_ANNOTATION = 'ansible.com/template-source';

export interface SourcePickerProps {
  syncKey: number;
  selectedSources: string[];
  onSourceChange: (sources: string[]) => void;
}

export const SourcePicker = ({
  syncKey,
  selectedSources,
  onSourceChange,
}: SourcePickerProps) => {
  const catalogApi = useApi(catalogApiRef);
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  useEffect(() => {
    const facetKey = `metadata.annotations.${TEMPLATE_SOURCE_ANNOTATION}`;
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Template' },
        facets: ['spec.type'],
      })
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          const nonEETypes = (response.facets['spec.type'] ?? [])
            .map(f => f.value)
            .filter(t => !t.includes('execution-environment'));
          return catalogApi.getEntityFacets({
            filter: {
              kind: 'Template',
              ...(nonEETypes.length > 0 && { 'spec.type': nonEETypes }),
            },
            facets: [facetKey],
          });
        },
      )
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          const sources = (response.facets[facetKey] ?? [])
            .map(f => f.value)
            .sort((a, b) => a.localeCompare(b));
          setAvailableSources(sources);
        },
      )
      .catch(() => {
        setAvailableSources([]);
      });
  }, [catalogApi, syncKey]);

  return (
    <TagFilterPicker
      label="Source Type"
      options={availableSources}
      value={selectedSources}
      onChange={onSourceChange}
      noOptionsText="No sources available"
    />
  );
};
