import { useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button, SearchField } from '@backstage/ui';
import styles from './CatalogExplorerLayout.module.css';

export interface CatalogExplorerLayoutProps {
  filters: ReactNode;
  search: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  children: ReactNode;
}

/** Keeps catalog controls consistent while leaving results and filter state with callers. */
export function CatalogExplorerLayout({
  filters,
  search,
  searchValue,
  onSearchChange,
  children,
}: CatalogExplorerLayoutProps): ReactElement {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();

  return (
    <div className={styles.explorer}>
      <Button
        className={styles.mobileFilterButton}
        variant="secondary"
        size="small"
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
        onPress={() => setFiltersOpen(open => !open)}
      >
        {filtersOpen ? 'Hide filters' : 'Filters'}
      </Button>
      <div className={styles.pageLayout}>
        <aside
          id={filtersId}
          className={styles.filterPanel}
          data-open={filtersOpen}
          aria-label={`${search} filters`}
        >
          <div className={styles.filterStack}>{filters}</div>
        </aside>
        <div className={styles.results}>
          <SearchField
            className={styles.search}
            aria-label={search}
            placeholder={search}
            value={searchValue}
            onChange={onSearchChange}
          />
          <div className={styles.tableInset}>{children}</div>
        </div>
      </div>
    </div>
  );
}
