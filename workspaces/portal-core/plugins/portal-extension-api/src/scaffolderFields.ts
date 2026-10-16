import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { useEffect, useReducer, useMemo } from 'react';
import { contributionRegistry } from './registry';

/** Standard Backstage fields, with Portal ownership and optional enablement. */
export interface ScaffolderFieldContribution {
  id: string;
  pluginId: string;
  enabledByConfig?: string;
  field: FieldExtensionOptions<any, any>;
}

export function registerScaffolderField<TValue, TUiOptions>(
  contribution: Omit<ScaffolderFieldContribution, 'field'> & {
    field: FieldExtensionOptions<TValue, TUiOptions>;
  },
): () => void {
  // Widgets validate their own typed values. The heterogeneous registry erases
  // that type only at storage, rather than requiring widgets to accept `any`.
  return contributionRegistry.registerScaffolderField(
    contribution as unknown as ScaffolderFieldContribution,
  );
}

/** Merge standard discovered fields with host fields. Host names always win. */
export function mergeScaffolderFields(
  host: FieldExtensionOptions<any, any>[],
  discovered: FieldExtensionOptions<any, any>[],
): FieldExtensionOptions<any, any>[] {
  return Array.from(
    new Map(
      [...discovered, ...host].map(field => [field.name, field]),
    ).values(),
  );
}

/** PoC registration adapter; independent of the plugin supplying a field. */
export function useScaffolderFields(): FieldExtensionOptions<any, any>[] {
  const config = useApi(configApiRef);
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const unsubscribe = contributionRegistry.subscribe(refresh);
    // Catch registrations between rendering and subscribing.
    refresh();
    return unsubscribe;
  }, []);
  return useMemo(
    () =>
      contributionRegistry
        .getScaffolderFields()
        .filter(
          contribution =>
            !contribution.enabledByConfig ||
            config.getOptionalBoolean(contribution.enabledByConfig) === true,
        )
        .map(contribution => contribution.field),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, revision],
  );
}
