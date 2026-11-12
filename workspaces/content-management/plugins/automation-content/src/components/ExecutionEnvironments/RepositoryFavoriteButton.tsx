import { useRef, useState } from 'react';
import { useTranslationRef } from '@backstage/frontend-plugin-api';
import { useStarredEntity } from '@backstage/plugin-catalog-react';
import { ButtonIcon, Flex, Text } from '@backstage/ui';
import { RiStarFill, RiStarLine } from '@remixicon/react';
import { eeTranslationRef } from '../../strings/en';

/** Update the same catalog favorite the stock repository entity header uses. */
export function RepositoryFavoriteButton({
  entityRef,
  repository,
}: {
  entityRef: string;
  repository: string;
}): JSX.Element {
  const { t } = useTranslationRef(eeTranslationRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntity(entityRef);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      await toggleStarredEntity();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <Flex
      direction="column"
      gap="1"
      align="start"
      onKeyDown={event => {
        // The surrounding table row also has an Enter action.
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      }}
    >
      <ButtonIcon
        aria-label={t(
          isStarredEntity
            ? 'inventory.removeFavorite'
            : 'inventory.addFavorite',
          { repository },
        )}
        aria-pressed={isStarredEntity}
        icon={isStarredEntity ? <RiStarFill /> : <RiStarLine />}
        variant="tertiary"
        isPending={pending}
        onPress={() => {
          void toggle();
        }}
      />
      {failed && <Text role="alert">{t('inventory.favoriteFailed')}</Text>}
    </Flex>
  );
}
