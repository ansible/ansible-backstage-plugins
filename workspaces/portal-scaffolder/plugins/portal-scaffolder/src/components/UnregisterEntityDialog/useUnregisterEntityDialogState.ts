import {
  ANNOTATION_ORIGIN_LOCATION,
  getCompoundEntityRef,
  type CompoundEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useCallback } from 'react';
import useAsync from 'react-use/esm/useAsync';

/** Discriminated union representing the resolved state of the unregister dialog. */
export type DialogState =
  | { type: 'loading' }
  | { type: 'error'; error: Error }
  | { type: 'bootstrap'; location: string; deleteEntity: () => Promise<void> }
  | { type: 'only-delete'; deleteEntity: () => Promise<void> }
  | {
      type: 'unregister';
      location: string;
      colocatedEntities: CompoundEntityRef[];
      unregisterLocation: () => Promise<void>;
      deleteEntity: () => Promise<void>;
    };

export function useUnregisterEntityDialogState(entity: Entity): DialogState {
  const catalogApi = useApi(catalogApiRef);
  const locationRef = entity.metadata.annotations?.[ANNOTATION_ORIGIN_LOCATION];
  const uid = entity.metadata.uid;
  const isBootstrap = locationRef === 'bootstrap:bootstrap';

  const prerequisites = useAsync(async () => {
    let locationPromise: Promise<
      Awaited<ReturnType<typeof catalogApi.getLocationByRef>> | undefined
    >;
    let colocatedEntitiesPromise: Promise<Entity[]>;

    if (locationRef) {
      locationPromise = catalogApi.getLocationByRef(locationRef);
      const locationAnnotationFilter = `metadata.annotations.${ANNOTATION_ORIGIN_LOCATION}`;
      colocatedEntitiesPromise = catalogApi
        .getEntities({
          filter: { [locationAnnotationFilter]: locationRef },
          fields: [
            'kind',
            'metadata.uid',
            'metadata.name',
            'metadata.namespace',
          ],
        })
        .then(response => response.items);
    } else {
      locationPromise = Promise.resolve(undefined);
      colocatedEntitiesPromise = Promise.resolve([]);
    }

    return Promise.all([locationPromise, colocatedEntitiesPromise]).then(
      ([location, colocatedEntities]) => ({
        location,
        colocatedEntities,
      }),
    );
  }, [catalogApi, entity]);

  const unregisterLocation = useCallback(
    async function unregisterLocationFn() {
      const { location } = prerequisites.value!;
      await catalogApi.removeLocationById(location!.id);
    },
    [catalogApi, prerequisites],
  );

  const deleteEntity = useCallback(
    async function deleteEntityFn() {
      await catalogApi.removeEntityByUid(uid!);
    },
    [catalogApi, uid],
  );

  if (isBootstrap) {
    return { type: 'bootstrap', location: locationRef!, deleteEntity };
  }

  const { loading, error, value } = prerequisites;
  if (loading) {
    return { type: 'loading' };
  } else if (error) {
    return { type: 'error', error };
  }

  const { location, colocatedEntities } = value!;
  if (!location) {
    return { type: 'only-delete', deleteEntity };
  }

  return {
    type: 'unregister',
    location: locationRef!,
    colocatedEntities: colocatedEntities.map(getCompoundEntityRef),
    unregisterLocation,
    deleteEntity,
  };
}
