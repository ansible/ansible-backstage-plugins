import { compatWrapper } from '@backstage/core-compat-api';
import { GlobalHeader } from './GlobalHeader';

/** The global header has no Create shortcut or plugin-contributed Create actions. */
export function NativeGlobalHeader() {
  return compatWrapper(<GlobalHeader />);
}
