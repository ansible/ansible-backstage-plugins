import { SkeletonLoader } from './SkeletonLoader';

const SKELETON_PLACEHOLDER_IDS = [1, 2, 3] as const;

/** First-paint / soft-refresh empty-state skeleton row for the templates grid. */
export function LoadingTemplatesPlaceholder() {
  return (
    <div
      data-testid="loading-templates"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        gap: '10px',
      }}
    >
      {SKELETON_PLACEHOLDER_IDS.map(id => (
        <SkeletonLoader key={`skeleton-${id}`} />
      ))}
    </div>
  );
}
