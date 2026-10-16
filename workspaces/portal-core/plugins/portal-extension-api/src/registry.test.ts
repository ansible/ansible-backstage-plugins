import { contributionRegistry } from './registry';
import { TabContribution, CardContribution, ActionContribution } from './types';
import { Entity } from '@backstage/catalog-model';

const mockEntity = (kind = 'Component'): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind,
  metadata: { name: 'test-entity', namespace: 'default' },
  spec: {},
});

const EP = 'test.extension.point';

describe('ContributionRegistry', () => {
  beforeEach(() => contributionRegistry.reset());

  describe('registerTab / getTabs', () => {
    it('returns a registered tab', () => {
      const tab: TabContribution = {
        id: 'tab-1',
        label: 'My Tab',
        component: () => null as any,
      };
      contributionRegistry.registerTab(EP, tab);
      expect(contributionRegistry.getTabs(EP)).toHaveLength(1);
      expect(contributionRegistry.getTabs(EP)[0].id).toBe('tab-1');
    });

    it('returns empty array for unknown extension point', () => {
      expect(contributionRegistry.getTabs('unknown.ep')).toHaveLength(0);
    });

    it('unregisters a tab when the returned cleanup is called', () => {
      const tab: TabContribution = {
        id: 'tab-unregister',
        label: 'Temp',
        component: () => null as any,
      };
      const unregister = contributionRegistry.registerTab(EP, tab);
      expect(contributionRegistry.getTabs(EP)).toHaveLength(1);
      unregister();
      expect(contributionRegistry.getTabs(EP)).toHaveLength(0);
    });

    it('replaces a tab with the same id and warns', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const tab1: TabContribution = {
        id: 'dup',
        label: 'Old',
        component: () => null as any,
      };
      const tab2: TabContribution = {
        id: 'dup',
        label: 'New',
        component: () => null as any,
      };
      contributionRegistry.registerTab(EP, tab1);
      contributionRegistry.registerTab(EP, tab2);
      expect(contributionRegistry.getTabs(EP)).toHaveLength(1);
      expect(contributionRegistry.getTabs(EP)[0].label).toBe('New');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('dup'));
      spy.mockRestore();
    });

    it('filters tabs by entity', () => {
      contributionRegistry.registerTab(EP, {
        id: 'visible',
        label: 'Visible',
        component: () => null as any,
        filter: e => e.kind === 'Component',
      });
      contributionRegistry.registerTab(EP, {
        id: 'hidden',
        label: 'Hidden',
        component: () => null as any,
        filter: e => e.kind === 'API',
      });
      expect(
        contributionRegistry.getTabs(EP, mockEntity('Component')),
      ).toHaveLength(1);
      expect(
        contributionRegistry.getTabs(EP, mockEntity('Component'))[0].id,
      ).toBe('visible');
    });

    it('hides a tab whose filter throws', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      contributionRegistry.registerTab(EP, {
        id: 'bad-filter',
        label: 'Bad',
        component: () => null as any,
        filter: () => {
          throw new Error('boom');
        },
      });
      expect(contributionRegistry.getTabs(EP, mockEntity())).toHaveLength(0);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('bad-filter'),
        expect.any(Error),
      );
      spy.mockRestore();
    });

    it('filters tabs by contentType — hides contributions that do not match', () => {
      contributionRegistry.registerTab(EP, {
        id: 'for-collection',
        label: 'Collection Only',
        component: () => null as any,
        appliesToContentTypes: ['collection'],
      });
      contributionRegistry.registerTab(EP, {
        id: 'for-any',
        label: 'Any',
        component: () => null as any,
        // no appliesToContentTypes → applies to everything
      });
      contributionRegistry.registerTab(EP, {
        id: 'for-star',
        label: 'Star',
        component: () => null as any,
        appliesToContentTypes: '*',
      });
      // Querying for 'collection' should show 'for-collection', 'for-any', 'for-star'
      const collectionTabs = contributionRegistry
        .getTabs(EP, undefined, 'collection')
        .map(t => t.id);
      expect(collectionTabs).toContain('for-collection');
      expect(collectionTabs).toContain('for-any');
      expect(collectionTabs).toContain('for-star');

      // Querying for 'playbook-repository' should hide 'for-collection'
      const repoTabs = contributionRegistry
        .getTabs(EP, undefined, 'playbook-repository')
        .map(t => t.id);
      expect(repoTabs).not.toContain('for-collection');
      expect(repoTabs).toContain('for-any');
      expect(repoTabs).toContain('for-star');
    });

    it('shows all tabs when no contentType is passed', () => {
      contributionRegistry.registerTab(EP, {
        id: 'for-collection',
        label: 'Collection Only',
        component: () => null as any,
        appliesToContentTypes: ['collection'],
      });
      contributionRegistry.registerTab(EP, {
        id: 'for-repo',
        label: 'Repo Only',
        component: () => null as any,
        appliesToContentTypes: ['playbook-repository'],
      });
      // No contentType filter → both should appear
      expect(contributionRegistry.getTabs(EP)).toHaveLength(2);
    });

    it('sorts tabs by priority', () => {
      contributionRegistry.registerTab(EP, {
        id: 'p50',
        label: 'P50',
        component: () => null as any,
        priority: 50,
      });
      contributionRegistry.registerTab(EP, {
        id: 'p10',
        label: 'P10',
        component: () => null as any,
        priority: 10,
      });
      contributionRegistry.registerTab(EP, {
        id: 'p30',
        label: 'P30',
        component: () => null as any,
        priority: 30,
      });
      const ids = contributionRegistry.getTabs(EP).map(t => t.id);
      expect(ids).toEqual(['p10', 'p30', 'p50']);
    });
  });

  describe('registerCard / getCards', () => {
    it('registers and retrieves cards', () => {
      const card: CardContribution = {
        id: 'card-1',
        slot: 'overview-left',
        component: () => null as any,
      };
      contributionRegistry.registerCard(EP, card);
      expect(contributionRegistry.getCards(EP)[0].slot).toBe('overview-left');
    });
  });

  describe('registerAction / getActions', () => {
    it('registers and retrieves actions', () => {
      const action: ActionContribution = {
        id: 'action-1',
        label: 'Run',
        onActivate: jest.fn(),
      };
      contributionRegistry.registerAction(EP, action);
      expect(contributionRegistry.getActions(EP)[0].label).toBe('Run');
    });
  });

  describe('disable / enable', () => {
    it('hides a disabled contribution and shows it again after enable', () => {
      const tab: TabContribution = {
        id: 'toggle',
        label: 'T',
        component: () => null as any,
      };
      contributionRegistry.registerTab(EP, tab);
      expect(contributionRegistry.getTabs(EP)).toHaveLength(1);

      contributionRegistry.disable('toggle');
      expect(contributionRegistry.getTabs(EP)).toHaveLength(0);

      contributionRegistry.enable('toggle');
      expect(contributionRegistry.getTabs(EP)).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('calls listener when a contribution is registered', () => {
      const listener = jest.fn();
      const unsub = contributionRegistry.subscribe(listener);
      contributionRegistry.registerTab(EP, {
        id: 'x',
        label: 'X',
        component: () => null as any,
      });
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('stops calling listener after unsubscribe', () => {
      const listener = jest.fn();
      const unsub = contributionRegistry.subscribe(listener);
      unsub();
      contributionRegistry.registerTab(EP, {
        id: 'y',
        label: 'Y',
        component: () => null as any,
      });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('clears all registrations', () => {
      contributionRegistry.registerTab(EP, {
        id: 'z',
        label: 'Z',
        component: () => null as any,
      });
      contributionRegistry.reset();
      expect(contributionRegistry.getTabs(EP)).toHaveLength(0);
    });
  });
});
