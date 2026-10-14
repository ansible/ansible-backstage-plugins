// @ts-nocheck
//
// Re-exports of Backstage scaffolder raw picker components that are NOT in the
// public API of @backstage/plugin-scaffolder.
//
// These must be imported via relative file-system paths to the dist output rather
// than the package import (`@backstage/plugin-scaffolder/dist/...`), because the
// package's `exports` map only allows `.` and `./alpha`.  A direct file-system
// path bypasses the exports-map check in the bundler, so this is the only way to
// reach these components without owning a fork.
//
// ⚠️  Path depth: this file lives at
//   workspaces/self-service/plugins/self-service/src/components/CreateTask/
// The repo root (where node_modules lives) is 7 directory levels up, so all
// relative paths below use seven `../` segments.
//
// If this file is ever moved, update the segment count accordingly.

const BASE =
  '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields';

export { EntityPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/EntityPicker/EntityPicker.esm.js';

export { EntityNamePicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/EntityNamePicker/EntityNamePicker.esm.js';

export { EntityTagsPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/EntityTagsPicker/EntityTagsPicker.esm.js';

export { RepoUrlPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/RepoUrlPicker/RepoUrlPicker.esm.js';

export { OwnerPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/OwnerPicker/OwnerPicker.esm.js';

export { OwnedEntityPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/OwnedEntityPicker/OwnedEntityPicker.esm.js';

export { MyGroupsPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/MyGroupsPicker/MyGroupsPicker.esm.js';

export { SecretInput } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/SecretInput/SecretInput.esm.js';

export { MultiEntityPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/MultiEntityPicker/MultiEntityPicker.esm.js';

export { RepoBranchPicker } from '../../../../../../../node_modules/@backstage/plugin-scaffolder/dist/components/fields/RepoBranchPicker/RepoBranchPicker.esm.js';
