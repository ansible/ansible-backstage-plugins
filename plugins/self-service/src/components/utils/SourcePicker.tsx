import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TagFilterPicker } from './TagFilterPicker';

export const TEMPLATE_SOURCE_ANNOTATION = 'ansible.com/template-source';

const SOURCE_FACET_KEY = `metadata.annotations.${TEMPLATE_SOURCE_ANNOTATION}`;

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
    let ignore = false;
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
            facets: [SOURCE_FACET_KEY],
          });
        },
      )
      .then(
        (response: { facets: Record<string, Array<{ value: string }>> }) => {
          if (ignore) return;
          const sources = (response.facets[SOURCE_FACET_KEY] ?? [])
            .map(f => f.value)
            .sort((a, b) => a.localeCompare(b));
          setAvailableSources(sources);
        },
      )
      .catch(() => {
        if (!ignore) setAvailableSources([]);
      });
    return () => {
      ignore = true;
    };
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
