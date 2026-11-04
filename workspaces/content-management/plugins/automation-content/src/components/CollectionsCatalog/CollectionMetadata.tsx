import { Flex, Link, Text } from '@backstage/ui';
import type { ContentCounts } from '../../api';
import { environmentHref } from '../ExecutionEnvironments/catalogHelpers';

/** Explicit unknown counts and digest-preserving provider links. */
export function CollectionMetadata({
  counts,
  providedBy,
  environmentBase,
}: {
  counts: ContentCounts;
  providedBy: string[];
  environmentBase: string;
}) {
  return (
    <Flex direction="column" gap="2">
      <Text>
        {counts.plugins ?? 'Unknown'} plugins · {counts.roles ?? 'Unknown'}{' '}
        roles · {counts.playbooks ?? 'Unknown'} playbooks ·{' '}
        {counts.edaPlugins ?? 'Unknown'} EDA plugins ·{' '}
        {counts.rulebooks ?? 'Unknown'} rulebooks
      </Text>
      <Text weight="bold">Provided by</Text>
      {providedBy.length ? (
        <ul title={providedBy.join(', ')}>
          {providedBy.slice(0, 10).map(ref => (
            <li key={ref}>
              <Link href={environmentHref(environmentBase, ref)} title={ref}>
                {ref}
              </Link>
            </li>
          ))}
          {providedBy.length > 10 && <li>+{providedBy.length - 10} more</li>}
        </ul>
      ) : (
        <Text>No providing execution environments reported.</Text>
      )}
    </Flex>
  );
}
