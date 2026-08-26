import { Entity, stringifyEntityRef } from '@backstage/catalog-model';

type DeregisterDialogState = {
  open: boolean;
  entity: Entity | null;
};

let state: DeregisterDialogState = { open: false, entity: null };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export const deregisterRepositoryDialogStore = {
  getState(): DeregisterDialogState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  open(entity: Entity): void {
    state = { open: true, entity };
    emit();
  },

  close(): void {
    state = { open: false, entity: null };
    emit();
  },

  isOpenForEntity(entity: Entity): boolean {
    return (
      state.open &&
      state.entity !== null &&
      stringifyEntityRef(state.entity) === stringifyEntityRef(entity)
    );
  },
};
