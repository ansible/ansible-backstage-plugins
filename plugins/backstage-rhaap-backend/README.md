# backstage-rhaap-backend

The backstage-rhaap-backend plugin enables APIs to check AAP subscriptions.

_This plugin was created through the Backstage CLI_

## Installation - with upstream backstage

The plugin is tested with backstage version '1.27.7'

### Setup backstage

```bash
git clone git@github.com:backstage/backstage.git
cd backstage
yarn install
```

Note: This has been tested with node version v18.19.0.

### Configure Backstage with the GitHub authentication

Refer <https://backstage.io/docs/auth/github/provider>

### Add the package

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @ansible/plugin-backstage-rhaap-backend
```
Or
```bash
cd plugins/backstage-rhaap-backend
yarn install
```

1. Manually copy the `plugins/backstage-rhaap-backend` directory to the
`plugins` folder at the backstage root directory.
1. Update the `packages/backend/package.json` file in the backstage root directory.
1. Add the dependencies under the `dependencies` sections as follows:
```json
     "@backstage/plugin-azure-sites-common": "workspace:^",
+    "@ansible/plugin-backstage-rhaap-backend": "^x.y.z",
     "@backstage/plugin-badges-backend": "workspace:^",
```

### Adding the plugin to your `packages/backend`

This step is needed to add the plugin to the router in your `backend` package.
Create a file called `packages/backend/src/plugins/backstage-rhaap.ts`

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

### Start frontend and backend

Run the following commands from the root folder of backstage in separate terminals.

Frontend

```bash
yarn start
````

Backend

```bash
yarn start-backend
```

Backend - vscode debug

Enable > Auto Attach: With Flag

```bash
yarn start-backend --inspect
```

## Installation - with  

### Setup janus-idp 

Refer to the step mentioned here <https://github.com//blob/main/#installing-a-dynamic-plugin-package-in-the-showcase>

Clone the  repository.
Run the following command from the `` folder.

### Install and prepare the plugin

Install the frontend plugin dependency in the Ansible plugins path by running the following command from the `ansible-backstage-plugins/plugins/backstage-rhaap-backend` folder.

```bash
yarn install
yarn export-dynamic
```

To load the frontend plugin with  locally, follow the steps below.

- Run the following commands

```bash
pkg=<local-clone-parent-path-replace-me>/ansible-backstage-plugins/plugins/backstage-rhaap-backend
archive=$(npm pack $pkg)
tar -xzf "$archive" && rm "$archive"
mv package $(echo $archive | sed -e 's:\.tgz$::')
```

### Plugin registration with 

- Update the following section in the `app-config.local.yaml` file.

```yaml
dynamicPlugins:
  backend:
    ansible.plugin-backstage-rhaap-backend: null
```

### Start the backend by running the command in the root folder of ``
   cloned repository path.

```bash
LOG_LEVEL=debug yarn start-backend
```

## AAP secrets configuration setup

Add Ansible Automation Platform (AAP) controller configuration in `app-config.yaml` file to allow for subscription check, the plugin is dependent on the provided configuration to do the
subscription check.

```yaml
ansible:
  rhaap:
    baseUrl: '<AAP controller base URL>'
    token: '<access token>'
    checkSSL: true
```