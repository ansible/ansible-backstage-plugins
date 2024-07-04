# backstage-rhaap

Welcome to the backstage-rhaap backend plugin!

_This plugin was created through the Backstage CLI_

## Installation

### Install the package

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @ansible/plugin-backstage-rhaap-backend
```
Or

Copy the `plugins/backstage-rhaap-backend` plugin folder under
`plugins` folder within the backstage root directory and update file
`packages/backend/package.json` within backstage root directory to add the depedency under the `dependencies` sections as below
```json
     "@backstage/plugin-azure-sites-common": "workspace:^",
+    "@ansible/plugin-backstage-rhaap-backend": "workspace:^",
     "@backstage/plugin-badges-backend": "workspace:^",
```
### Adding the plugin to your `packages/backend`

You'll need to add the plugin to the router in your `backend` package. You can do this by creating a file called `packages/backend/src/plugins/backstage-rhaap.ts`

```typescript
import { PluginEnvironment } from '../types';
import { createRouter } from '@ansible/plugin-backstage-rhaap-backend';
import { Router } from 'express';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  return await createRouter({
    logger: env.logger,
    config: env.config,
  });
}
```

With the `backstage-rhaap.ts` router setup in place, add the router to `packages/backend/src/index.ts`:

```diff
+ import backstageRhaap from './plugins/backstage-rhaap';

async function main() {
  ...
  const createEnv = makeCreateEnv(config);

   const nomadEnv = useHotMemoize(module, () => createEnv('nomad'));
   const signalsEnv = useHotMemoize(module, () => createEnv('signals'));
+  const backstageRhaapEnv = useHotMemoize(module, () => createEnv('backstage-rhaap'));


  const apiRouter = Router();
+  apiRouter.use('/backstage-rhaap', await backstageRhaap(backstageRhaapEnv));
  ...
  apiRouter.use(notFoundHandler());
```

### AAP configuration setup

Add Ansible Automation Platform (AAP) controller configuration in `app-config.yaml` file to allow for subsctiption check
```yaml
ansible:
  aap:
    baseUrl: '<AAP controller base URL>'
    token: '<access token>'
    checkSSL: true
```
