# Getting started with Ansible plugins (The setup steps are temporary and will eventually change as we integrate with RDH)

> **Note:** This repository is under active development and is not yet ready for production use.

1. Setup backstage

```bash
git clone git@github.com:backstage/backstage.git
cd backstage
yarn install
```

Note: Tested with node v16.20.2 version

2.Configure Backstage with the Github authentication

Refer <https://backstage.io/docs/auth/github/provider>

In `app-config.yaml` file add below lines at the end of `locations` sections:

```yaml
    - type: file
      target: ../../plugins/scaffolder-backend-module-ansible/templates/all.yaml
      rules:
        - allow: [Template]
```

3. Add and Install Ansible plugins dependencies within Backstage

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

4. Configure Backstage to load plugins manually

Add the below line in the file `packages/app/package.json` within the `dependencies` section

```json
   "@backstage/plugin-ansible": "^0.0.0",
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
+import { AnsiblePage } from '@backstage/plugin-ansible';

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

Register the plugin in the sidebar navigation by applying below diff in file `packages/app/src/components/Root/Root.tsx`

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
+import { AnsibleLogo } from '@backstage/plugin-ansible'

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
+    "@backstage/plugin-scaffolder-backend-module-ansible": "^0.0.0",
     "@backstage/plugin-scaffolder-backend-module-confluence-to-markdown": "workspace:^",
     "@backstage/plugin-scaffolder-backend-module-gitlab": "workspace:^",
     "@backstage/plugin-scaffolder-backend-module-rails": "workspace:^"
```

Register custom action provided by `scaffolder-backend-module-ansible` in scaffolder backend by applying below diff in file `packages/backend/src/plugins/scaffolder.ts`

```diff
% git diff packages/backend/src/plugins/scaffolder.ts
diff --git a/packages/backend/src/plugins/scaffolder.ts b/packages/backend/src/plugins/scaffolder.ts
index a2aa1044066c..ffa238ed1196 100644
--- a/packages/backend/src/plugins/scaffolder.ts
+++ b/packages/backend/src/plugins/scaffolder.ts
@@ -23,6 +23,7 @@ import { Router } from 'express';
 import type { PluginEnvironment } from '../types';
 import { ScmIntegrations } from '@backstage/integration';
 import { createConfluenceToMarkdownAction } from '@backstage/plugin-scaffolder-backend-module-confluence-to-markdown';
+import { createAnsibleContentAction } from '@backstage/plugin-scaffolder-backend-module-ansible';

 export default async function createPlugin(
   env: PluginEnvironment,
@@ -47,6 +48,7 @@ export default async function createPlugin(
       config: env.config,
       reader: env.reader,
     }),
+    createAnsibleContentAction(),
   ];

   return await createRouter({
```

5. Start frontend and backend by running below commands at the root folder of backstage in seperate terminals

Frontend

```bash
yarn start
```

Backend

```bash
yarn start-backend
```

The Backstage plugin can be reached is running at the endpoint

```
http://localhost:3000/ansible
```
