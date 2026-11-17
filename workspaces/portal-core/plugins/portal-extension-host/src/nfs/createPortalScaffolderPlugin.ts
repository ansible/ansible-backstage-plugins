import {
  ApiBlueprint,
  appTreeApiRef,
  createExtensionInput,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import {
  FormFieldBlueprint,
  formFieldsApiRef,
  type FormField,
} from '@backstage/plugin-scaffolder-react/alpha';

// Scaffolder 1.38.2 also adds these fallbacks AFTER loading native fields.
// Disabling a native built-in does not remove its wizard fallback. Keep its
// name reserved; Secret has only a fallback and no native extension.
const builtinSources = new Map<string, string | undefined>([
  ['EntityPicker', 'entity-picker'],
  ['EntityNamePicker', 'entity-name-picker'],
  ['EntityTagsPicker', 'entity-tags-picker'],
  ['RepoUrlPicker', 'repo-url-picker'],
  ['OwnerPicker', 'owner-picker'],
  ['OwnedEntityPicker', 'owned-entity-picker'],
  ['MyGroupsPicker', 'my-groups-picker'],
  ['MultiEntityPicker', 'multi-entity-picker'],
  ['RepoBranchPicker', 'repo-branch-picker'],
  ['RepoOwnerPicker', 'repo-owner-picker'],
  ['Secret', undefined],
]);

type FieldRegistration = { source: string; load: () => Promise<FormField> };

async function loadUniqueFields(registrations: FieldRegistration[]) {
  const loaded = await Promise.all(
    registrations.map(async ({ source, load }) => ({
      source,
      field: await load(),
    })),
  );
  const owners = new Map<string, string[]>();
  for (const { source, field } of loaded) {
    // Public loaders return opaque FormFields. Validate the creation-time name
    // at this compatibility boundary; never unwrap private versioned internals.
    if (
      !field ||
      typeof field !== 'object' ||
      !('name' in field) ||
      typeof field.name !== 'string' ||
      !field.name.trim()
    ) {
      throw new Error(`Cannot validate scaffolder field name from ${source}`);
    }
    const name = field.name;
    const sources = owners.get(name) ?? [];
    const builtin = builtinSources.get(name);
    if (
      builtinSources.has(name) &&
      (builtin === undefined ||
        source !== `scaffolder-form-field:scaffolder/${builtin}`)
    ) {
      sources.push(`built-in ${name}`);
    }
    sources.push(source);
    owners.set(name, sources);
  }
  const conflicts = [...owners].filter(([, sources]) => sources.length > 1);
  if (conflicts.length) {
    conflicts.sort(([a], [b]) => a.localeCompare(b));
    throw new Error(
      conflicts
        .map(([name, sources]) => {
          const uniqueSources = [...new Set(sources)];
          uniqueSources.sort((a, b) => a.localeCompare(b));
          return `Duplicate scaffolder field name "${name}": ${uniqueSources.join(
            ', ',
          )}`;
        })
        .join('; '),
    );
  }
  return loaded.map(({ field }) => field);
}

/** Native Scaffolder with an app-wide, fail-closed field-name boundary. */
export function createPortalScaffolderPlugin(): FrontendPlugin {
  const fieldLoader = FormFieldBlueprint.dataRefs.formFieldLoader;
  const fieldsApi = ApiBlueprint.makeWithOverrides({
    name: 'form-fields',
    inputs: { formFields: createExtensionInput([fieldLoader]) },
    factory(originalFactory, { inputs }) {
      const nativeFields = inputs.formFields.map(input => ({
        source: input.node.spec.id,
        load: input.get(fieldLoader),
      }));
      return originalFactory(define =>
        define({
          api: formFieldsApiRef,
          deps: { appTreeApi: appTreeApiRef },
          factory: ({ appTreeApi }) => ({
            async loadFormFields() {
              // The public page input also accepts fields supplied by compatibility
              // adapters. Include it before checking the complete field set.
              const page = appTreeApi
                .getTree()
                .tree.nodes.get('page:scaffolder');
              const pageFields =
                page?.edges.attachments.get('formFields') ?? [];
              const compatibilityFields = pageFields.flatMap(node => {
                const load = node.instance?.getData(fieldLoader);
                return load ? [{ source: node.spec.id, load }] : [];
              });
              return loadUniqueFields([
                ...nativeFields,
                ...compatibilityFields,
              ]);
            },
          }),
        }),
      );
    },
  });
  return scaffolderPlugin.withOverrides({ extensions: [fieldsApi] });
}
