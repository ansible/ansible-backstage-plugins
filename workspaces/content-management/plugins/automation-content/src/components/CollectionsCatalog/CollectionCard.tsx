import type { Entity } from '@backstage/catalog-model';
import type { ReactElement } from 'react';
import {
  Badge,
  ButtonIcon,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Link,
  Text,
} from '@backstage/ui';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import type { Collection, Registry } from '../../api';
import {
  collectionSourceType,
  getLatestRegistryCheck,
  registriesForProviders,
} from './collectionHelpers';
import styles from './CollectionsCatalogPage.module.css';

export interface CollectionCardProps {
  collection: Collection;
  href: string;
  registries: Registry[];
  catalogEntities: Entity[];
  catalogMetadataAvailable: boolean;
  isStarredEntity: (entity: Entity) => boolean;
  toggleStarredEntity: (entity: Entity) => void;
}

function timeSince(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  );
  if (elapsedSeconds < 60) return 'Just now';
  if (elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return `${minutes}m ago`;
  }
  if (elapsedSeconds < 86400) {
    const hours = Math.floor(elapsedSeconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(elapsedSeconds / 86400);
  return `${days}d ago`;
}

/** A compact collection/version card with verified source and sync metadata. */
export function CollectionCard({
  collection,
  href,
  registries,
  catalogEntities,
  catalogMetadataAvailable,
  isStarredEntity,
  toggleStarredEntity,
}: CollectionCardProps): ReactElement {
  const providerRegistries = registriesForProviders(
    collection.providedBy,
    registries,
  );
  const sourceType = collectionSourceType(collection.providedBy, registries);
  const latestCheck =
    sourceType === 'external-registry'
      ? getLatestRegistryCheck(providerRegistries)
      : undefined;
  const availableToStar =
    catalogMetadataAvailable && catalogEntities.length > 0;
  const starred = catalogEntities.some(isStarredEntity);
  const source = sourceType === 'external-registry' ? 'External registry' : '—';
  const syncText = latestCheck?.lastReconciledAt
    ? `${timeSince(latestCheck.lastReconciledAt)}${
        latestCheck.lastReconcileOk === false ? ' · failed' : ''
      }`
    : '—';

  const toggleStar = () => {
    const targets = starred
      ? catalogEntities.filter(isStarredEntity)
      : catalogEntities;
    targets.forEach(entity => toggleStarredEntity(entity));
  };

  return (
    <Card className={styles.collectionCard}>
      <CardHeader className={styles.cardHeader}>
        <Flex direction="column" gap="2" className={styles.cardHeading}>
          <Link href={href} className={styles.collectionTitle}>
            {collection.fqcn}
          </Link>
          <Badge>v{collection.version}</Badge>
        </Flex>
        <ButtonIcon
          className={styles.starButton}
          variant="tertiary"
          size="small"
          isDisabled={!availableToStar}
          aria-pressed={starred}
          icon={starred ? <StarIcon /> : <StarBorderIcon />}
          aria-label={
            availableToStar
              ? `${starred ? 'Remove' : 'Add'} ${collection.fqcn} v${
                  collection.version
                } ${starred ? 'from' : 'to'} favorites`
              : `Favorites unavailable for ${collection.fqcn} v${collection.version}; a matching catalog collection entry could not be verified`
          }
          onPress={toggleStar}
        />
      </CardHeader>
      <CardBody className={styles.cardBody}>
        <div className={styles.metadataRow} role="group" aria-label="Source">
          <Text as="span" color="secondary">
            Source
          </Text>
          <Text as="span" className={styles.metadataValue}>
            {source}
          </Text>
        </div>
        <div className={styles.metadataRow} role="group" aria-label="Last sync">
          <Text as="span" color="secondary">
            Last sync
          </Text>
          <Text as="span" className={styles.metadataValue}>
            {syncText}
          </Text>
        </div>
      </CardBody>
    </Card>
  );
}
