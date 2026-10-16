import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';

/** Validate unique typed field declarations and reject unsupported manifest contracts. */
export function collectScaffolderFields(
  fields: readonly ScaffolderFieldDescriptor[],
  hostApiVersion = '0.1.0',
) {
  const valid = fields.filter(field => {
    try {
      const capability = field.manifest.capabilities.find(
        item => item.id === field.capabilityId,
      );
      const entry = capability?.entryPoints.find(
        item => item.id === field.entryPointId,
      );
      return (
        validateManifest(field.manifest, hostApiVersion).valid &&
        capability &&
        entry &&
        capability.ownerPlugin === field.manifest.id &&
        !capability.appliesTo &&
        capability.id.startsWith(`${field.manifest.id}.`) &&
        entry.id.startsWith(`${field.manifest.id}.`) &&
        field.attachment === 'scaffolder.fields' &&
        entry.kind === 'scaffolder-field' &&
        entry.surface === 'experience-slot' &&
        entry.launches.type === 'slot' &&
        entry.launches.targetSlot === field.attachment &&
        entry.appliesToContentTypes.length > 0 &&
        entry.appliesToContentTypes.every(
          type =>
            (Object.values(CONTENT_TYPES) as readonly string[]).includes(
              type,
            ) &&
            (capability.appliesToContentTypes === '*' ||
              capability.appliesToContentTypes.includes(type)),
        ) &&
        (capability.appliesToContentTypes === '*' ||
          capability.appliesToContentTypes.every(type =>
            (Object.values(CONTENT_TYPES) as readonly string[]).includes(type),
          )) &&
        /^[A-Za-z][A-Za-z0-9_-]*$/.test(field.fieldName) &&
        typeof field.loader === 'function'
      );
    } catch {
      return false;
    }
  });
  // Ambiguous widget names/IDs fail closed rather than letting load order choose an owner.
  return valid.filter(
    field =>
      valid.filter(other => other.fieldName === field.fieldName).length === 1 &&
      valid.filter(other => other.entryPointId === field.entryPointId)
        .length === 1,
  );
}
