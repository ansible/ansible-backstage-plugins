import { contributionRegistry } from '../registry';
import { EXTENSION_POINTS } from '../extensionPoints';
import type { CardContribution } from '../types';

export const registerTemplateDetailCard = (card: CardContribution) =>
  contributionRegistry.registerCard(
    EXTENSION_POINTS.TEMPLATE_DETAIL_CARDS,
    card,
  );
