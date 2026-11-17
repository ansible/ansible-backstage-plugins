import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { AapAuthApi } from '../api';

export function createAapAuthApiExtension() {
  return ApiBlueprint.make({
    name: 'rhaap-auth',
    params: define => define(AapAuthApi),
  });
}
