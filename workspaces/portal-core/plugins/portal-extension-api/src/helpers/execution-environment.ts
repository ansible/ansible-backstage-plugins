import { contributionRegistry } from '../registry';
import { EXTENSION_POINTS } from '../extensionPoints';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from '../types';

export const registerEEDetailTab = (tab: TabContribution) =>
  contributionRegistry.registerTab(EXTENSION_POINTS.EE_DETAIL_TABS, tab);

export const registerEEDetailCard = (card: CardContribution) =>
  contributionRegistry.registerCard(EXTENSION_POINTS.EE_DETAIL_CARDS, card);

export const registerEEDetailAction = (action: ActionContribution) =>
  contributionRegistry.registerAction(
    EXTENSION_POINTS.EE_DETAIL_ACTIONS,
    action,
  );

export const registerEEListTab = (tab: TabContribution) =>
  contributionRegistry.registerTab(EXTENSION_POINTS.EE_LIST_TABS, tab);
