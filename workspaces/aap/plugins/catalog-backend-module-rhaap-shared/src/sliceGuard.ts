/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type CatalogModuleSlice = 'all' | 'aap' | 'content' | 'ee';

const SHIM_MODULE_ID = 'rhaap';

const activeSlices = new Set<CatalogModuleSlice>();

/**
 * §4.8 — fail fast when the deprecated shim loads together with any split module.
 */
export function assertCatalogModuleSliceAllowed(
  moduleId: string,
  slice: CatalogModuleSlice,
): void {
  if (slice === 'all') {
    if (activeSlices.size > 0) {
      throw new Error(
        `[catalog] Cannot load deprecated catalog-backend-module-rhaap (moduleId: ${SHIM_MODULE_ID}) ` +
          `together with split catalog modules (${[...activeSlices].join(', ')}). ` +
          'Use mutually exclusive dynamic plugin bundles per catalog-module-research §4.5.',
      );
    }
    activeSlices.add('all');
    return;
  }

  if (activeSlices.has('all')) {
    throw new Error(
      `[catalog] Cannot load catalog module "${moduleId}" (slice: ${slice}) while ` +
        `deprecated catalog-backend-module-rhaap (moduleId: ${SHIM_MODULE_ID}) is active.`,
    );
  }

  activeSlices.add(slice);
}

/** Test-only reset. */
export function resetCatalogModuleSliceGuardForTests(): void {
  activeSlices.clear();
}
