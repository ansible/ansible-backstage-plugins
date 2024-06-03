# Ansible plugins for Red Hat developer hub

## Getting started with Ansible plugins

**Note:**

- The setup steps are temporary and will change as we integrate with RHDH using dynamic loading
- This repository is under active development and is not yet ready for production use.

### 1. Setup backstage

```bash
git clone git@github.com:backstage/backstage.git
cd backstage
yarn install
```

Note: Tested with node v16.20.2 version

### 2. Configure Backstage with the Github authentication

Refer <https://backstage.io/docs/auth/github/provider>

In `app-config.yaml` file add below lines at the end of `locations` sections:

```yaml
- type: file
  target: ../../plugins/scaffolder-backend-module-ansible/templates/all.yaml
  rules:
    - allow: [Template]
```

### 3. Add and Install Ansible plugin dependencies within Backstage

Clone the plugins from the repo in the `backstage/plugins` folder
Install dependencies

```bash
cd ansible
yarn install
cd ../ansible-backend
yarn install
cd ../scaffolder-backend-module-ansible
yarn install
cd ..
```

### 4. Configure Backstage to load plugins manually

Add the below line in the file `packages/app/package.json` within the `dependencies` section

```json
   "@janus-idp/backstage-plugin-ansible": "^0.0.0",
```

Add Ansible plugin route in file `packages/app/src/App.tsx` as shown in diff below

```diff
% git diff packages/app/src/App.tsx
diff --git a/packages/app/src/App.tsx b/packages/app/src/App.tsx
index 3d8bd45e5aab..752e5e2e9190 100644
--- a/packages/app/src/App.tsx
+++ b/packages/app/src/App.tsx
@@ -108,6 +108,7 @@ import { DevToolsPage } from '@backstage/plugin-devtools';
 import { customDevToolsPage } from './components/devtools/CustomDevToolsPage';
 import { CatalogUnprocessedEntitiesPage } from '@backstage/plugin-catalog-unprocessed-entities';
 import { NotificationsPage } from '@backstage/plugin-notifications';
+import { AnsiblePage } from '@janus-idp/backstage-plugin-ansible';

 const app = createApp({
   apis,
@@ -274,6 +275,7 @@ const routes = (
       {customDevToolsPage}
     </Route>
     <Route path="/notifications" element={<NotificationsPage />} />
+    <Route path="/ansible" element={<AnsiblePage />} />
   </FlatRoutes>
 );
```

Register the plugin in the sidebar navigation by applying the below diff in file `packages/app/src/components/Root/Root.tsx`

```diff
% git diff  packages/app/src/components/Root/Root.tsx
diff --git a/packages/app/src/components/Root/Root.tsx b/packages/app/src/components/Root/Root.tsx
index 6294aa785671..f23085e4e0cb 100644
--- a/packages/app/src/components/Root/Root.tsx
+++ b/packages/app/src/components/Root/Root.tsx
@@ -53,6 +53,7 @@ import Score from '@material-ui/icons/Score';
 import { useApp } from '@backstage/core-plugin-api';
 import BuildIcon from '@material-ui/icons/Build';
 import { NotificationsSidebarItem } from '@backstage/plugin-notifications';
+import { AnsibleLogo } from '@janus-idp/backstage-plugin-ansible'

 const useSidebarLogoStyles = makeStyles({
   root: {
@@ -164,6 +165,7 @@ export const Root = ({ children }: PropsWithChildren<{}>) => (
             text="Cost Insights"
           />
           <SidebarItem icon={Score} to="score-board" text="Score board" />
+          <SidebarItem icon={AnsibleLogo} to="ansible" text="Ansible" />
         </SidebarScrollWrapper>
         <SidebarDivider />
         <Shortcuts allowExternalLinks />
```

Register `ansible-backend` and `scaffolder-backend-module-ansible` plugins by applying below diff in file `packages/backend/package.json`

```diff
% git diff packages/backend/package.json
diff --git a/packages/backend/package.json b/packages/backend/package.json
index 48d7d7255217..65e7ecbea28f 100644
--- a/packages/backend/package.json
+++ b/packages/backend/package.json
@@ -33,6 +33,7 @@
     "@backstage/config": "workspace:^",
     "@backstage/integration": "workspace:^",
     "@backstage/plugin-adr-backend": "workspace:^",
+    "@backstage/plugin-ansible-backend": "^0.0.0",
     "@backstage/plugin-app-backend": "workspace:^",
     "@backstage/plugin-auth-backend": "workspace:^",
     "@backstage/plugin-auth-node": "workspace:^",
@@ -62,6 +63,7 @@
     "@backstage/plugin-proxy-backend": "workspace:^",
     "@backstage/plugin-rollbar-backend": "workspace:^",
     "@backstage/plugin-scaffolder-backend": "workspace:^",
+    "@janus-idp/backstage-plugin-scaffolder-backend-module-ansible": "^0.0.0",
     "@backstage/plugin-scaffolder-backend-module-confluence-to-markdown": "workspace:^",
     "@backstage/plugin-scaffolder-backend-module-gitlab": "workspace:^",
     "@backstage/plugin-scaffolder-backend-module-rails": "workspace:^"
```

Register custom action provided by `scaffolder-backend-module-ansible` in scaffolder backend by applying the below diff in file `packages/backend-legacy/src/plugins`

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
+import { createAnsibleContentAction } from '@janus-idp/backstage-plugin-scaffolder-backend-module-ansible';
 export default async function createPlugin(
   env: PluginEnvironment,
 ): Promise<Router> {
@@ -47,6 +47,7 @@ export default async function createPlugin(
       config: env.config,
       reader: env.reader,
     }),
+    createAnsibleContentAction(env.config),
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
+  import('@janus-idp/backstage-plugin-scaffolder-backend-module-ansible'),
+);

 backend.start();
```

### 5. Install ansible-creator tool required for scaffolding Ansible content

```bash
pip install ansible-creator
```

### 6. Setup Github integration to publish the repository

Under the `integrations` section within backstage `app-config.yaml` file
add your GitHub personal access token as shown below

````yaml
  github:
    - host: github.com
      token: <GITHUB_PAT>

### 7. Start frontend and backend by running below commands at the root folder of backstage in seperate terminals

Frontend

```bash
yarn start
````

Backend

```bash
yarn start-backend
```

The Backstage plugin can be reached is running at the endpoint

```
http://localhost:3000/ansible
```

# Installing with Backstage showcase

Refer to the step mentioned here <https://github.com//blob/main/#installing-a-dynamic-plugin-package-in-the-showcase>

Clone the  repository and within the ``
folder run the below command

## Frontend plugin

Install frontend plugin dependency in the Ansible plugins path by running below command in `ansible-backstage-plugins/ansible` folder

```bash
yarn install
```

To load the frontend plugin with  locally follow the below steps

- Run the following commands

```bash
pkg=<local-clone-parent-path-replace-me>/ansible-backstage-plugins/ansible
archive=$(npm pack $pkg)
tar -xzf "$archive" && rm "$archive"
mv package $(echo $archive | sed -e 's:\.tgz$::')
```

- Add the below section in `app-config.local.yaml` file

```yaml
dynamicPlugins:
  frontend:
    janus-idp.backstage-plugin-ansible:
      appIcons:
        - name: AnsibleLogo
          importName: AnsibleLogo
      dynamicRoutes:
        - path: /ansible
          importName: AnsiblePage
          menuItem:
            icon: AnsibleLogo
            text: Ansible
```

- Start frontend by running the command in the root folder of ``
  cloned repository path.

```bash
LOG_LEVEL=debug yarn start
```

## Backend plugin

To load the backend plugin with  locally follow the below steps

- Run the following commands

```bash
cd scaffolder-backend-module-ansible
yarn export-dynamic
```

- Update the below section in `app-config.local.yaml` file

```yaml
dynamicPlugins:
  backend:
    backstage.plugin-scaffolder-backend-module-ansible:
      mountPoints:
        - importName: createAnsibleContentAction
          mountPoint: entity.page.overview/cards
```

and register the template catalog section in `app-config.local.yaml` file

```yaml
catalog:
  locations:
    - type: file
      target: ../..//scaffolder-backend-module-ansible/templates/all.yaml
      rules:
        - allow: [Template]
```

- Update the integration section in `app-config.local.yaml` file so with your secret to push the scaffolded repo to GH.

```yaml
integrations:
  github:
    - host: github.com
      token: "foo_ThisIsATopSecretTokenToPushDataInGh"
```

- Update the package.json at `packages/backend/package.json`

```json
"@backstage/plugin-scaffolder-backend-module-ansible": "^0.0.0",
```

Note - if node version is 20.x.y please update

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

Note - ^this step is not required when testing the plugin with upstream backstage or  RHDH as both have the `@backstage/plugin-scaffolder-backend-module-github` pre-registered, but for testing things with   this is needed as
it by default does not pack the extra actions. Do run yarn-install from  root for the changes to be impacted.

5. Start the backend by running the command in the root folder of ``
   cloned repository path.

```bash
LOG_LEVEL=debug yarn start-backend
```

## Installing Ansible plugins with RHDH instance running on Openshift using helm chart

### Pre-requisite

- Openshift cluster installed on a supported provider Refer docs here <https://docs.openshift.com/container-platform/4.15/installing/installing_aws/installing-aws-account.html>
- RHDH instance installed on openshift cluster using helm charts. Refer docs here <https://access.redhat.com/documentation/en-us/red_hat_developer_hub/1.0/html/getting_started_with_red_hat_developer_hub/proc-install-rhdh-helm_rhdh-getting-started>

### Create plugin tar file to upload in the plugin registry

- Setting up environment

```bash
export DYNAMIC_PLUGIN_ROOT_DIR=<clone-path-changem>/ansible-backstage-plugins/.tmp/dynamic-plugin-root
mkdir -p $DYNAMIC_PLUGIN_ROOT_DIR

export KUBECONFIG=<path-to-oc-config-file-changeme>/kubeconfig
```

- Create frontend plugin tar

```bash
cd ansible-backstage-plugins/ansible
yarn install
yarn export-dynamic
INTEGRITY_HASH=$(npm pack --pack-destination $DYNAMIC_PLUGIN_ROOT_DIR --json | jq -r '.[0].integrity')
ls -l $DYNAMIC_PLUGIN_ROOT_DIR
echo "Integrity Hash: $INTEGRITY_HASH"
```

- Create scaffolder plugin tar

```bash
cd ansible-backstage-plugins/scaffolder-backend-module-ansible
yarn install
yarn export-dynamic
INTEGRITY_HASH=$(npm pack --pack-destination $DYNAMIC_PLUGIN_ROOT_DIR --json | jq -r '.[0].integrity')
ls -l $DYNAMIC_PLUGIN_ROOT_DIR
echo "Integrity Hash: $INTEGRITY_HASH"
```

#### Note: Integrity check is currently not working, hence to disable it set an environment for plugin-registry to disable integrity check

```bash
kubectl set env deployment/rhdh-backstage -c install-dynamic-plugins -e SKIP_INTEGRITY_CHECK="true"
```

- Upload to the tar to plugin registry

```bash
oc project <YOUR_PROJECT_OR_NAMESPACE_CHANGEME>
oc new-build httpd --name=plugin-registry --binary
oc start-build plugin-registry --from-dir=$DYNAMIC_PLUGIN_ROOT_DIR --wait
oc new-app --image-stream=plugin-registry
```

Ensure the tar files are uploaded to plugin registry by connecting to the plugin-registry
pod terminal. Sample output:

```bash
sh-4.4$ ls
janus-idp-backstage-plugin-ansible-0.0.0.tgz  janus-idp-backstage-plugin-scaffolder-backend-module-ansible-0.0.0.tgz
```

In the helm chart releases for the project, click on `Actions->Upgrade` and in the YAML view
append the below config under `dynamic.plugins` section

```yaml
- disabled: false
  package: >-
    http://plugin-registry:8080/janus-idp-backstage-plugin-ansible-0.0.0.tgz
  pluginConfig:
    dynamicPlugins:
      frontend:
        janus-idp.backstage-plugin-ansible:
          appIcons:
            - importName: AnsibleLogo
              name: AnsibleLogo
          dynamicRoutes:
            - importName: AnsiblePage
              menuItem:
                icon: AnsibleLogo
                text: Ansible
              path: /ansible
- disabled: false
  package: >-
    http://plugin-registry:8080/janus-idp-backstage-plugin-scaffolder-backend-module-ansible-0.0.0.tgz
  pluginConfig:
    dynamicPlugins:
      backend:
        janus-idp.backstage-plugin-scaffolder-backend-module-ansible:
          mountPoints:
            - importName: createAnsibleContentAction
              mountPoint: entity.page.overview/cards
```
