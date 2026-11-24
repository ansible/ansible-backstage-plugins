# backstage-rhaap

The backstage-rhaap frontend plugin enables the Ansible sidebar option and provides access to the frontend plugin

_Note: This plugin was created through the Backstage CLI_

## Installation with the new frontend system

The native frontend plugin is the default export of
`@ansible/plugin-backstage-rhaap/alpha`. It provides the `page:ansible` extension
at `/ansible`, with Overview, My Items, Create, and Learn tabs. The existing
package-root exports remain available for legacy applications.

This repository's source NFS app loads the plugin in the `full` development
profile and shows an Ansible sidebar link. The `core` and `scaffolder` profiles
omit it.

Add the package to your frontend app's dependencies and register the native
plugin in the app's feature list:

```tsx
import { createApp } from '@backstage/frontend-defaults';
import ansiblePlugin from '@ansible/plugin-backstage-rhaap/alpha';

const app = createApp({
  features: [ansiblePlugin],
});

export default app.createRoot();
```

Keep the host's existing catalog, scaffolder, search, authentication, and API features
installed. The Ansible page reuses those services for catalog browsing and
template launching. Installing this page does not install those host features.

The plugin declares its route and page title, so native applications do not need
a legacy `<Route>` registration. Hosts with custom navigation can link to
`/ansible`. The page path can also be configured through `app.extensions`:

```yaml
app:
  extensions:
    - page:ansible:
        config:
          path: /ansible
```

### Dynamic installation in a native RHDH app

From the repository root, export the plugin using the repository's RHDH CLI:

```bash
yarn workspace @ansible/plugin-backstage-rhaap export-dynamic --clean
```

The generated `dist-dynamic` package includes the native module-federation
feature declared in `backstage.features`. Install that package through the
host's dynamic-plugin installer. Native hosts discover its `/alpha` feature
without the legacy `dynamicRoutes` and `appIcons` configuration shown below.
The current CLI also generates legacy Scalprum assets for existing deployments.

The legacy `AppThemeFixer` export remains available for hosts that use it.
The native plugin leaves global theme styling to the host and does not register
that legacy application listener.

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
yarn --cwd packages/backend add @ansible/plugin-backstage-rhaap
```

Or

```bash
cd plugins/backstage-rhaap
yarn install
```

Add the following line in the `dependencies` section of the `packages/app/package.json` file.

```json
     "@backstage/plugin-azure-sites-common": "workspace:^",
+    "@ansible/plugin-backstage-rhaap": "^x.y.z",
     "@backstage/plugin-badges-backend": "workspace:^",
```

### Adding the plugin to your `packages/app`

Add the Ansible plugin route in the `packages/app/src/App.tsx` file as shown in the following `diff` output.

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
+import { AnsiblePage } from '@ansible.plugin-backstage-rhaap';

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

Register the plugin in the sidebar navigation by applying the following `diff` in the `packages/app/src/components/Root/Root.tsx` file.

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
+import { AnsibleLogo } from '@ansible.plugin-backstage-rhaap'

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

### Start frontend and backend

Run the following commands in separate terminals from the root folder of backstage.

Frontend

```bash
yarn start
```

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

- Update the below section in `app-config.local.yaml` file

```yaml
dynamicPlugins:
  frontend:
    ansible.plugin-backstage-rhaap:
      appIcons:
        - importName: AnsibleLogo
          name: AnsibleLogo
      dynamicRoutes:
        - importName: AnsiblePage
          menuItem:
            icon: AnsibleLogo
            text: Ansible
          path: /ansible
```

### Start the front end and backend by running the command in the root folder of `rhdh` cloned repository path.

```bash
LOG_LEVEL=debug yarn start
```

## AAP secrets configuration setup

Add Ansible Automation Platform (AAP) controller configuration in `app-config.yaml` file.

```yaml
ansible:
  rhaap:
    baseUrl: '<AAP controller base URL>'
    token: '<access token>'
    checkSSL: true
```
