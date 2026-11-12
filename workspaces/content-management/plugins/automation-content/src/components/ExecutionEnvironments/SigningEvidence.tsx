import { useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Flex,
  Text,
} from '@backstage/ui';
import type {
  EESigningState,
  SigningObservation,
} from '@ansible/automation-content-common/eeRepository';
import { eeTranslationRef } from '../../strings/en';

export function SigningEvidence({
  state,
  observation,
  compact = false,
}: {
  state?: EESigningState;
  observation?: SigningObservation;
  compact?: boolean;
}): JSX.Element {
  const { t } = useTranslationRef(eeTranslationRef);
  const signingState = observation?.state ?? state ?? 'undetermined';
  const label = t(`signing.${signingState}`);
  const status = {
    signed: 'success',
    'not-signed': 'danger',
    undetermined: 'warning',
  } as const;
  if (compact) return <Text>{label}</Text>;

  return (
    <Flex direction="column" gap="2">
      <Alert
        status={status[signingState]}
        title={t('signing.title', { state: label })}
        description={t('signing.explanation')}
      />
      <Accordion>
        <AccordionTrigger title={t('signing.evidence')} />
        <AccordionPanel>
          {observation ? (
            <>
              <Text as="p">
                {t('signing.observed', {
                  time: new Date(observation.observedAt).toLocaleString(),
                })}
              </Text>
              <ul>
                {observation.mechanisms.map(({ mechanism, outcome }) => (
                  <li key={mechanism}>
                    {t(`signing.mechanisms.${mechanism}`)} ·{' '}
                    {t(`signing.outcomes.${outcome}`)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Text as="p">{t('signing.unavailable')}</Text>
          )}
        </AccordionPanel>
      </Accordion>
    </Flex>
  );
}
