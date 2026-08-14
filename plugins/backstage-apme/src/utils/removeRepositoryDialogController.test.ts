/*
 * Copyright Red Hat
 */

import type { Entity } from '@backstage/catalog-model';
import {
  clearRemoveRepositoryRequest,
  requestRemoveRepository,
  subscribeRemoveRepositoryDialog,
} from './removeRepositoryDialogController';

const entity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, uid: `uid-${name}` },
  spec: { type: 'git-repository' },
});

describe('removeRepositoryDialogController', () => {
  afterEach(() => {
    clearRemoveRepositoryRequest();
  });

  it('notifies subscribers when remove is requested', () => {
    const seen: Array<Entity | null> = [];
    const unsub = subscribeRemoveRepositoryDialog(e => {
      seen.push(e);
    });

    // Immediate invoke with current (null)
    expect(seen).toEqual([null]);

    const target = entity('ans-tower-devsecops');
    requestRemoveRepository(target);
    expect(seen).toEqual([null, target]);

    clearRemoveRepositoryRequest();
    expect(seen).toEqual([null, target, null]);

    unsub();
  });

  it('does not notify after unsubscribe', () => {
    const seen: Array<Entity | null> = [];
    const unsub = subscribeRemoveRepositoryDialog(e => {
      seen.push(e);
    });
    unsub();
    requestRemoveRepository(entity('other'));
    expect(seen).toEqual([null]);
  });
});
