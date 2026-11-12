import { Component, Suspense, type ReactNode } from 'react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useTranslationRef } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import type { EntityContentLayoutProps } from '@backstage/plugin-catalog-react/alpha';
import { Alert, Flex, Text } from '@backstage/ui';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { useNativeEntityPage } from '@ansible/portal-extension-host/alpha';
import { eeDetailsEntryId } from '../../manifest';
import { eeTranslationRef } from '../../strings/en';

class EEContributionBoundary extends Component<
  { children: ReactNode; errorMessage: string },
  { failed: boolean }
> {
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  state = { failed: false };

  override render(): ReactNode {
    if (this.state.failed) {
      return <Alert status="danger" title={this.props.errorMessage} />;
    }
    return this.props.children;
  }
}

// The stock Overview owns route selection. The Portal hook supplies eligible bodies.
function selectStockOverview(): void {}

export function EEEntityContent({
  cards,
}: EntityContentLayoutProps): JSX.Element {
  const { entity } = useEntity();
  const { t } = useTranslationRef(eeTranslationRef);
  const native = useNativeEntityPage(
    entity,
    CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE,
    selectStockOverview,
  );
  const ImageContent = native?.tabs.find(
    tab => tab.id === eeDetailsEntryId,
  )?.component;
  const loading = <Text role="status">{t('detail.loading')}</Text>;
  let body = <Text>{t('detail.unavailable')}</Text>;
  if (ImageContent) {
    body = (
      <EEContributionBoundary
        key={stringifyEntityRef(entity)}
        errorMessage={t('detail.failed')}
      >
        <Suspense fallback={loading}>
          <ImageContent />
        </Suspense>
      </EEContributionBoundary>
    );
  } else if (native && native.eligibleTabs === undefined) {
    body = loading;
  }

  return (
    <Flex direction="column" gap="4">
      {body}
      {cards.map(({ element }, index) => (
        <div key={element.key ?? index}>{element}</div>
      ))}
    </Flex>
  );
}
