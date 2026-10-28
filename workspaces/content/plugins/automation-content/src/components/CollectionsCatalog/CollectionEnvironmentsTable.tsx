import { CellText, Table, useTable, type ColumnConfig } from '@backstage/ui';
import type { Collection } from '../../api';
import { EmptyState } from '../common';
import { environmentHref } from '../ExecutionEnvironments/catalogHelpers';

interface ProviderRow {
  id: string;
  version: string;
  ref: string;
}

/** All version/artifact relationships, never a mutable-tag identity. */
export function CollectionEnvironmentsTable({
  versions,
  environmentBase,
}: {
  versions: Collection[];
  environmentBase: string;
}) {
  const data = versions.flatMap(version =>
    version.providedBy.map(ref => ({
      id: `${version.version}:${ref}`,
      version: version.version,
      ref,
    })),
  );
  const table = useTable<ProviderRow>({
    mode: 'complete',
    data,
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  const columns: ColumnConfig<ProviderRow>[] = [
    {
      id: 'environment',
      label: 'Execution environment',
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.ref}
          href={environmentHref(environmentBase, row.ref)}
        />
      ),
    },
    {
      id: 'version',
      label: 'Collection version',
      cell: row => <CellText title={row.version} />,
    },
  ];
  return (
    <Table
      {...table.tableProps}
      columnConfig={columns}
      emptyState={
        <EmptyState
          title="No providing execution environments"
          description="No indexed images report shipping this collection."
        />
      }
    />
  );
}
