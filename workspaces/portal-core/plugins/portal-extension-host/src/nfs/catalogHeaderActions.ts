import { parseEntityRef } from '@backstage/catalog-model';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type {
  CatalogHeaderActionDescriptor,
  ScaffolderWorkflowDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';

export function collectScaffolderWorkflows(
  workflows: readonly ScaffolderWorkflowDescriptor[],
) {
  const seen = new Set<string>();
  return workflows.filter(workflow => {
    try {
      const ref = parseEntityRef(workflow.templateRef);
      if (
        !workflow.workflowId.startsWith(`${workflow.ownerPlugin}.`) ||
        workflow.workflowId.length <= workflow.ownerPlugin.length + 1 ||
        ref.kind.toLowerCase() !== 'template' ||
        !/^[a-z0-9_-]+$/i.test(ref.namespace) ||
        !/^[a-z0-9_.-]+$/i.test(ref.name) ||
        seen.has(workflow.workflowId)
      )
        return false;
      seen.add(workflow.workflowId);
      return true;
    } catch {
      return false;
    }
  });
}
export function resolveCatalogHeaderAction(
  action: CatalogHeaderActionDescriptor,
) {
  const capability = action.manifest.capabilities.find(
    item => item.id === action.capabilityId,
  );
  return {
    capability,
    entry: capability?.entryPoints.find(
      item => item.id === action.entryPointId,
    ),
  };
}
export function collectCatalogHeaderActions(
  actions: readonly CatalogHeaderActionDescriptor[],
  workflows: readonly ScaffolderWorkflowDescriptor[],
  version = '0.1.0',
) {
  const seen = new Set<string>();
  return actions
    .filter(action => {
      try {
        const { capability, entry } = resolveCatalogHeaderAction(action);
        if (
          !validateManifest(action.manifest, version).valid ||
          !capability ||
          !entry ||
          capability.ownerPlugin !== action.manifest.id ||
          capability.appliesTo ||
          !capability.id.startsWith(`${action.manifest.id}.`) ||
          !entry.id.startsWith(`${action.manifest.id}.`) ||
          action.attachment !== 'catalog.header.actions' ||
          entry.kind !== 'entity-action' ||
          entry.surface !== 'experience-slot' ||
          entry.launches.type !== 'workflow' ||
          !entry.requiredPermission ||
          !entry.appliesToContentTypes.length ||
          !entry.appliesToContentTypes.every(
            type =>
              Object.values(CONTENT_TYPES).some(known => known === type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
          ) ||
          !workflows.some(
            workflow =>
              entry.launches.type === 'workflow' &&
              workflow.workflowId === entry.launches.workflowId &&
              workflow.ownerPlugin === action.manifest.id,
          ) ||
          seen.has(entry.id)
        )
          return false;
        seen.add(entry.id);
        return true;
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        (resolveCatalogHeaderAction(a).entry?.order ?? 0) -
        (resolveCatalogHeaderAction(b).entry?.order ?? 0),
    );
}
