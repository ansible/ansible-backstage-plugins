# scaffolder-backend-module-backstage-rhaap

The scaffolder-backend-module-backstage-rhaap plugin scaffolds an Ansible collection or playbook project and adds the repo to source control. The scaffolder is dependent on ansible-devtools-server.

_Note: This plugin was created through the Backstage CLI_

## Installation - with upstream backstage

The plugin is tested with backstage version '1.27.7'

### Setup backstage

```bash
git clone git@github.com:backstage/backstage.git
cd backstage
yarn install
```

Note: This has neen tested with node version v18.19.0.

### Configure Backstage with the GitHub authentication

Refer <https://backstage.io/docs/auth/github/provider>

### Add the package

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @ansible/plugin-scaffolder-backend-module-backstage-rhaap
```

Or

```bash
cd plugins/scaffolder-backend-module-backstage-rhaap
yarn install
```

1. Manually copy the `plugins/scaffolder-backend-module-backstage-rhaap` directory to the
   `plugins` folder in the backstage root directory.
1. Update the
   `packages/backend/package.json` file in the backstage root directory to
   add the dependencies under the `dependencies` sections as follows:

```json
     "@backstage/plugin-azure-sites-common": "workspace:^",
+    "@ansible/plugin-scaffolder-backend-module-backstage-rhaap": "^x.y.z",
     "@backstage/plugin-badges-backend": "workspace:^",
```

### Adding the plugin to the correct places to register the scaffolder plugin

Register the custom action provided by `plugin-scaffolder-backend-module-backstage-rhaap` in the scaffolder backend by applying the below diff in the `packages/backend-legacy/src/plugins` file.

```diff
% git diff packages/backend-legacy/src/plugins/scaffolder.ts
diff --git a/packages/backend-legacy/src/plugins/scaffolder.ts b/packages/backend-legacy/src/plugins/scaffolder.ts
index a2aa1044066c..191ab4fcfa4f 100644
--- a/packages/backend-legacy/src/plugins/scaffolder.ts
+++ b/packages/backend-legacy/src/plugins/scaffolder.ts
@@ -23,7 +23,7 @@ import { Router } from 'express';
 import type { PluginEnvironment } from '../types';
 import { ScmIntegrations } from '@backstage/integration';
 import { createConfluenceToMarkdownAction } from '@backstage/plugin-scaffolder-backend-module-confluence-to-markdown';
-
+import { createAnsibleContentAction } from '@ansible/plugin-scaffolder-backend-module-backstage-rhaap';
 export default async function createPlugin(
   env: PluginEnvironment,
 ): Promise<Router> {
@@ -47,6 +47,7 @@ export default async function createPlugin(
       config: env.config,
       reader: env.reader,
     }),
+    createAnsibleContentAction(env.config, env.logger),
   ];

   return await createRouter({
```

Register custom action in packages/backend-legacy/src/plugins/backend/src/index.ts by applying the below diff in file `packages/backend/src/index.ts`

```diff

diff --git a/packages/backend/src/index.ts b/packages/backend/src/index.ts
index a4acd19cf207..39ec727dbc18 100644
--- a/packages/backend/src/index.ts
+++ b/packages/backend/src/index.ts
@@ -15,7 +15,8 @@
  */

 import { createBackend } from '@backstage/backend-defaults';
 const backend = createBackend();

 backend.add(import('@backstage/plugin-auth-backend'));
@@ -47,5 +48,8 @@ backend.add(import('@backstage/plugin-search-backend/alpha'));
 backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
 backend.add(import('@backstage/plugin-signals-backend'));
 backend.add(import('@backstage/plugin-notifications-backend'));
+backend.add(
+  import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap'),
+);

 backend.start();
```

### Setting up the community-ansible-dev-tools service

```bash
❯ podman pull ghcr.io/ansible/community-ansible-dev-tools:latest
Trying to pull ghcr.io/ansible/community-ansible-dev-tools:latest...
Getting image source signatures
Writing manifest to image destination
bf2da01c9e75d209f8cc7db3c2add706903292a53c34b68f456b1a7b2caae9de

❯ podman run -d -p 8000:8000 --name=ansible-devtools-server ghcr.io/ansible/community-ansible-dev-tools:latest adt server
c42ff7b0b083e5388bbbaa0d2bf3969ef29d9c5dfd193621dec596139cc4bddc

# For v1 API
❯ curl -v -O -J --header "Content-Type: application/json" \
  --data '{"collection":"namespace.name", "project": "collection"}' \
  "localhost:8000/v1/creator/collection"
* processing: localhost:8000/v1/creator/collection
> Host: localhost:8000

# For v2 API
❯ curl -v -O -J --header "Content-Type: application/json" \
  --data '{"collection":"namespace.name", "project": "collection"}' \
  "localhost:8000/v2/creator/collection"
* processing: localhost:8000/v2/creator/collection
> Host: localhost:8000
...
< Content-Disposition: attachment; filename="namespace.name.tar"
<
{ [24769 bytes data]
100 24825  100 24769  100    56   251k    581 --:decrement:-- --:decrement:-- --:decrement:--  252k
* Closing connection

# For v1 API
❯ curl -v -O -J --header "Content-Type: application/json" \
  --data '{"project":"ansible-project", "scm_org":"ansible", "scm_project": "devops"}' \
  "localhost:8000/v1/creator/playbook"
* processing: localhost:8000/v1/creator/playbook
> Host: localhost:8000

# For v2 API
❯ curl -v -O -J --header "Content-Type: application/json" \
  --data '{"project":"ansible-project", "namespace":"ansible", "collection_name": "devops"}' \
  "localhost:8000/v2/creator/playbook"
* processing: localhost:8000/v2/creator/playbook
> Host: localhost:8000
...
< Content-Disposition: attachment; filename="ansible.devops.tar"
<
{ [24769 bytes data]
100 24825  100 24769  100    56   251k    581 --:decrement:-- --:decrement:-- --:decrement:--  252k
* Closing connection

❯ ls
 namespace.name.tar
 ansible.devops.tar
```

### Add ansible-rhdh-templates reference in app-config.yaml

This loads the templates from the `ansible-rhdh-templates` repository in Templates.

```bash
diff --git a/app-config.yaml b/app-config.yaml
index cb701705411b..efca1acfd19b 100644
--- a/app-config.yaml
+++ b/app-config.yaml
@@ -200,7 +200,7 @@ allure:
 integrations:
   github:
     - host: github.com
@@ -305,6 +305,21 @@ catalog:
       target: ../../plugins/scaffolder-backend/sample-templates/all-templates.yaml
       rules:
         - allow: [Template]
+    - type: url
+      target: https://github.com/ansible/ansible-rhdh-templates/blob/main/all.yaml
+      rules:
+        - allow: [Template]
```

### Start scaffolder backend

Run the following commands from the root folder of the backstage.

Backend

```bash
yarn start-backend
```

Backend - VS Code debug

Enable > Auto Attach: With Flag

```bash
yarn start-backend --inspect
```

## Installation - with rhdh

Refer to the step mentioned here <https://github.com//blob/main/docs/dynamic-plugins/packaging-dynamic-plugins.md>

### Plugin registration with

- Update the following section in the `app-config.local.yaml` file.

```yaml
dynamicPlugins:
  backend:
    ansible.plugin-scaffolder-backend-module-backstage-rhaap: null
```

### Required steps to enable other dependent actions

```diff
diff --git a/packages/backend/package.json b/packages/backend/package.json
index d05d495..92424f9 100644
--- a/packages/backend/package.json
+++ b/packages/backend/package.json
@@ -47,11 +47,11 @@
     "@backstage/plugin-search-backend-node": "1.2.17",
     "@internal/plugin-dynamic-plugins-info-backend": "*",
     "@internal/plugin-scalprum-backend": "*",
+    "@backstage/plugin-scaffolder-backend-module-github": "0.2.6",
     "@janus-idp/backstage-plugin-rbac-backend": "2.4.1",
     "@janus-idp/backstage-plugin-rbac-node": "1.0.3",
     "@manypkg/get-packages": "2.2.0",
     "app": "*",
     "better-sqlite3": "9.3.0",
     "express": "4.19.2",
     "express-prom-bundle": "6.6.0",
```

- To register action with ID 'publish:github' we need to patch backend/src/index.ts

```diff
diff --git a/packages/backend/src/index.ts b/packages/backend/src/index.ts
index c679098..c67b5ff 100644
--- a/packages/backend/src/index.ts
+++ b/packages/backend/src/index.ts
@@ -65,7 +65,7 @@ backend.add(
 );
 backend.add(dynamicPluginsFrontendSchemas());
 backend.add(dynamicPluginsRootLoggerServiceFactory());
-
+backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
 backend.add(import('@backstage/plugin-app-backend/alpha'));
 backend.add(
   import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
```

### Start the backend by running the command in the root folder of `rhdh`

cloned repository path.

```bash
LOG_LEVEL=debug yarn start-backend
```

## Creator service configuration and DevSpaces configuration

Add the devSpaces and creatorService in the `app-config.yaml` file.
The devSpaces baseUrl is optional. It adds the Ansible DevSpaces option to the Catalog UI.

```yaml
ansible:
  devSpaces:
    baseUrl: 'https://devspaces.apps.ansible-rhdh.testing.ansible.com/'
  creatorService:
    baseUrl: '127.0.0.1'
    port: '8000'
```

```yaml
catalog:
  stitchingStrategy:
    immediate: true
  orphanStrategy: delete
  processingInterval: { seconds: 10 }
  pollingInterval: { seconds: 1 }
  stitchTimeout: { minutes: 1 }
  import:
    entityFilename: catalog-info.yaml
    pullRequestBranchName: backstage-integration
  rules:
    - allow:
        [Component, System, Group, Resource, Location, Template, API, Users]
  locations:
    - type: url
      target: https://github.com/ansible/ansible-rhdh-templates/blob/main/all.yaml
      rules:
        - allow: [Template]
  providers:
    rhaap:
      dev:
        schedule:
          frequency: { minutes: 30 }
          timeout: { seconds: 5 }
ansible:
  rhaap:
    baseUrl: { $AAP_URL }
    checkSSL: false
```
