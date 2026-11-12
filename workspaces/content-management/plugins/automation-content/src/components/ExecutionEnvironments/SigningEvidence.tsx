import { useTranslationRef } from '@backstage/frontend-plugin-api';
import { Text } from '@backstage/ui';
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
  if (compact) {
    return (
      <Text>
        {t(`signing.${observation?.state ?? state ?? 'undetermined'}`)}
      </Text>
    );
  }
  if (!observation?.mechanisms.length)
    return <Text>{t('signing.unavailable')}</Text>;

  return (
    <ul>
      {observation.mechanisms.map(({ mechanism, outcome }) => (
        <li key={mechanism}>
          {t(`signing.mechanisms.${mechanism}`)} ·{' '}
          {t(`signing.outcomes.${outcome}`)}
        </li>
      ))}
    </ul>
  );
}
