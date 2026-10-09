import { useEffect, useMemo } from 'react';
import { Typography } from '@material-ui/core';
import { ItemCardGrid } from '@backstage/core-components';
import { useEntityList } from '@backstage/plugin-catalog-react';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { WizardCard } from '../TemplateCard';
import { LoadingTemplatesPlaceholder } from '../LoadingTemplatesPlaceholder';
import { TemplatesPagination } from '../TemplatesPagination';
import { resolvePageLimit } from '../constants';
import { isExecutionEnvironmentType } from '../constants';
import { resolveCatalogOffset } from './offsetRefresh';
import { useStaleWhileRevalidate } from './useStaleWhileRevalidate';

type TemplateGridProps = {
  /** True while JT autocomplete is loading (first paint only). */
  externalLoading: boolean;
};

/**
 * Templates card grid + pagination with stale-while-revalidate during soft refresh.
 */
export const TemplateGrid = ({ externalLoading }: TemplateGridProps) => {
  const {
    entities,
    loading: catalogLoading,
    totalItems,
    limit,
    offset,
    setOffset,
    setLimit,
  } = useEntityList();

  const pageLimit = resolvePageLimit(limit);
  const {
    displayEntities,
    displayTotalCount,
    displayOffset,
    showInitialSkeleton,
  } = useStaleWhileRevalidate({
    entities,
    totalItems,
    offset,
    loading: externalLoading || catalogLoading,
  });

  useEffect(() => {
    if (limit !== undefined && limit !== pageLimit) {
      setOffset?.(0);
      setLimit?.(pageLimit);
    }
  }, [limit, pageLimit, setLimit, setOffset]);

  const page = displayOffset ? Math.floor(displayOffset / pageLimit) : 0;
  const totalPages = Math.max(1, Math.ceil(displayTotalCount / pageLimit));
  const startIndex = displayTotalCount === 0 ? 0 : page * pageLimit + 1;
  const endIndex = Math.min(displayTotalCount, (page + 1) * pageLimit);

  const visibleEntities = useMemo(
    () =>
      (displayEntities as TemplateEntityV1beta3[]).filter(
        entity => !isExecutionEnvironmentType(entity.spec?.type),
      ),
    [displayEntities],
  );

  if (showInitialSkeleton) {
    return <LoadingTemplatesPlaceholder />;
  }

  if (displayTotalCount === 0) {
    return (
      <div data-testid="templates-container">
        <Typography
          variant="body1"
          style={{ textAlign: 'center', padding: '40px 0', opacity: 0.6 }}
        >
          No templates found.
        </Typography>
      </div>
    );
  }

  return (
    <div data-testid="templates-container">
      <ItemCardGrid>
        {visibleEntities.map(template => (
          <WizardCard key={template.metadata.uid} template={template} />
        ))}
      </ItemCardGrid>
      <TemplatesPagination
        totalCount={displayTotalCount}
        pageLimit={pageLimit}
        page={page}
        totalPages={totalPages}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={nextOffset =>
          setOffset?.(resolveCatalogOffset(nextOffset))
        }
        onPageSizeChange={nextLimit => {
          setOffset?.(0);
          setLimit?.(nextLimit);
        }}
      />
    </div>
  );
};
