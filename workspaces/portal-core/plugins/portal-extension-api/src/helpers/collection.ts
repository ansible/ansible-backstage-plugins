import { contributionRegistry } from '../registry';
import { EXTENSION_POINTS } from '../extensionPoints';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from '../types';

export const registerCollectionDetailTab = (tab: TabContribution) =>
  contributionRegistry.registerTab(
    EXTENSION_POINTS.COLLECTION_DETAIL_TABS,
    tab,
  );

export const registerCollectionDetailCard = (card: CardContribution) =>
  contributionRegistry.registerCard(
    EXTENSION_POINTS.COLLECTION_DETAIL_CARDS,
    card,
  );

export const registerCollectionDetailAction = (action: ActionContribution) =>
  contributionRegistry.registerAction(
    EXTENSION_POINTS.COLLECTION_DETAIL_ACTIONS,
    action,
  );
