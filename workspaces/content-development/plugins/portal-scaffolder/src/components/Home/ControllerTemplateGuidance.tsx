import { useState } from 'react';
import {
  createTranslationRef,
  useTranslationRef,
} from '@backstage/core-plugin-api/alpha';
import { Alert, Button, Flex } from '@backstage/ui';

const controllerTemplateTranslationRef = createTranslationRef({
  id: 'portal-scaffolder.controller-template',
  messages: {
    title: 'Use an execution environment in Controller',
    description:
      'Select a template to add the selected image to Ansible Automation Controller.',
    dismiss: 'Dismiss',
    clearFilters: 'Clear filters',
  },
});

export function ControllerTemplateGuidance({
  onClear,
}: Readonly<{ onClear: () => void }>): JSX.Element {
  const { t } = useTranslationRef(controllerTemplateTranslationRef);
  const [dismissed, setDismissed] = useState(false);
  return (
    <Flex direction="column" gap="2" mb="4">
      {!dismissed && (
        <Alert
          status="info"
          title={t('title')}
          description={t('description')}
          customActions={
            <Button variant="tertiary" onPress={() => setDismissed(true)}>
              {t('dismiss')}
            </Button>
          }
        />
      )}
      <Flex>
        <Button variant="tertiary" onPress={onClear}>
          {t('clearFilters')}
        </Button>
      </Flex>
    </Flex>
  );
}
