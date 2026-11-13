const ownerRegistryKey = Symbol.for(
  '@ansible/backstage-rhaap-common/scaffolder-module-owners',
);

/** Ensures the legacy and split AAP scaffolder modules are not installed together. */
export function assertAapScaffolderModuleIsUnique(
  scaffolderExtensionPoint: object,
  moduleName: string,
): void {
  let owners = Reflect.get(globalThis, ownerRegistryKey) as
    | WeakMap<object, string>
    | undefined;

  if (!owners) {
    owners = new WeakMap<object, string>();
    Reflect.set(globalThis, ownerRegistryKey, owners);
  }

  const existingOwner = owners.get(scaffolderExtensionPoint);
  if (existingOwner) {
    throw new Error(
      `AAP scaffolder module "${moduleName}" cannot be installed because "${existingOwner}" already owns AAP scaffolder registrations. Install only one AAP scaffolder module.`,
    );
  }

  owners.set(scaffolderExtensionPoint, moduleName);
}
