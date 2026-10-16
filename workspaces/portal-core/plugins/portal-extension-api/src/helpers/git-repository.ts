import { contributionRegistry } from '../registry';
import { EXTENSION_POINTS } from '../extensionPoints';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from '../types';

export const registerGitRepoDetailTab = (tab: TabContribution) =>
  contributionRegistry.registerTab(EXTENSION_POINTS.GIT_REPO_DETAIL_TABS, tab);

export const registerGitRepoDetailCard = (card: CardContribution) =>
  contributionRegistry.registerCard(
    EXTENSION_POINTS.GIT_REPO_DETAIL_CARDS,
    card,
  );

export const registerGitRepoDetailAction = (action: ActionContribution) =>
  contributionRegistry.registerAction(
    EXTENSION_POINTS.GIT_REPO_DETAIL_ACTIONS,
    action,
  );

export const registerGitRepoListTab = (tab: TabContribution) =>
  contributionRegistry.registerTab(EXTENSION_POINTS.GIT_REPO_LIST_TABS, tab);

export const registerGitRepoListAction = (action: ActionContribution) =>
  contributionRegistry.registerAction(
    EXTENSION_POINTS.GIT_REPO_LIST_ACTIONS,
    action,
  );
