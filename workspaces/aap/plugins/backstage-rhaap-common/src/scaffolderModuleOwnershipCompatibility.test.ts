import { assertAapScaffolderModuleIsUnique } from '@ansible/aap-node';
import { assertAapScaffolderModuleIsUnique as legacyGuard } from './scaffolderModuleOwnership';

it('forwards the legacy ownership guard to the node package', () => {
  expect(legacyGuard).toBe(assertAapScaffolderModuleIsUnique);
});
