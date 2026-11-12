import { useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
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
  const label = t(`signing.${observation?.state ?? state ?? 'undetermined'}`);
  if (compact) return <Text>{label}</Text>;

  return (
    <Flex direction="column" gap="2">
      <Text weight="bold">{label}</Text>
      <Accordion>
        <AccordionTrigger title={t('signing.evidence')} />
        <AccordionPanel>
          <Text as="p">{t('signing.explanation')}</Text>
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
