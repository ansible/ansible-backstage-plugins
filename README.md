[![CI / frontend](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/tests-frontend.yaml/badge.svg?branch=main&event=schedule)](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/tests-frontend.yaml) [![CI / backend](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/test-backend.yaml/badge.svg?event=schedule)](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/test-backend.yaml)
[![CI / scaffolder / backend](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/tests-scaffolder-backend.yaml/badge.svg?event=schedule)](https://github.com/ansible/ansible-backstage-plugins/actions/workflows/tests-scaffolder-backend.yaml)

# Ansible plugins for Red Hat Developer Hub

## Plugin httpd registry creation steps -
#### These steps are valid for both helm and operator installation -

### Install OpenShift cluster on AWS using CLI installer

Prerequisite: Make sure that the AWS account is configured locally using the AWS configure command.

- Generate a key pair for cluster node SSH access - [doc](https://docs.openshift.com/container-platform/4.10/installing/installing_aws/installing-aws-default.html#ssh-agent-using_installing-aws-default)
- Obtaining the installation program based on the local OS installation - [doc](https://docs.openshift.com/container-platform/4.10/installing/installing_aws/installing-aws-default.html#installation-obtaining-installer_installing-aws-default)
- Deploying the cluster - [doc](https://docs.openshift.com/container-platform/4.10/installing/installing_aws/installing-aws-default.html#installation-launching-installer_installing-aws-default)

### Downloading the plugins tar from GitHub releases.
Download the plugin .tar files from the [GitHub release page](https://github.com/ansible/ansible-backstage-plugins/releases).
to the following location:

```bash
DYNAMIC_PLUGIN_ROOT_DIR=<ansible-backstage-plugins-local-path-changeme>/.tmp/dynamic-plugin-root
cd $DYNAMIC_PLUGIN_ROOT_DIR
<download-plugin-tar-here>
```

### (Or) Baking the plugins for setup

```bash
DYNAMIC_PLUGIN_ROOT_DIR=<ansible-backstage-plugins-local-path-changeme>/.tmp/dynamic-plugin-root
git clone git@github.com:ansible/ansible-backstage-plugins.git
cd ansible-backstage-plugins/plugins/<TO_BE_REPLACED_WITH_PLUGIN_NAME>
yarn install
yarn export-dynamic
INTEGRITY_HASH=$(npm pack --pack-destination $DYNAMIC_PLUGIN_ROOT_DIR --json | jq -r '.[0].integrity')
ls -l $DYNAMIC_PLUGIN_ROOT_DIR
echo "Integrity Hash: $INTEGRITY_HASH"
```

This step verifies that all the plugin .tar files are in one location.

All the tarballs that were downloaded or baked.

```bash
local$ ls
ansible-plugin-backstage-rhaap-1.0.0.tgz
ansible-plugin-backstage-rhaap-backend-1.0.0.tgz
ansible-plugin-scaffolder-backend-module-backstage-rhaap-1.0.0.tgz
```

### Create and upload the plugins to build an httpd service and call it plugin-registry

- Create and Upload tar to the plugin registry

```bash
export KUBECONFIG=<path-to-oc-config-file-changeme>/kubeconfig
oc project <YOUR_PROJECT_OR_NAMESPACE_CHANGEME>
oc new-build httpd --name=plugin-registry --binary
oc start-build plugin-registry --from-dir=$DYNAMIC_PLUGIN_ROOT_DIR --wait
oc new-app --image-stream=plugin-registry
```

#### To skip the integrity check during installation, set the following environment variable.

Note - this is not required for the production environment
```bash
kubectl set env deployment/rhdh-backstage -c install-dynamic-plugins -e SKIP_INTEGRITY_CHECK="true"
```

Ensure the tar files are uploaded to build named plugin-registry-{Number} by connecting to the pod's terminal. Sample output:

```bash
sh-4.4$ ls
ansible-plugin-backstage-rhaap-1.0.0.tgz
ansible-plugin-backstage-rhaap-backend-1.0.0.tgz
ansible-plugin-scaffolder-backend-module-backstage-rhaap-1.0.0.tgz
```

### Repack with version update (to update the plugin version or re-push the plugin to the registry)

1. Run the npm pack steps again with the updated code source.
2. Switch to the RHDH namespace using the oc project command.
3. Run the following command:

```bash
oc start-build plugin-registry --from-dir=$DYNAMIC_PLUGIN_ROOT_DIR --wait
```
## Installing Ansible plugins with RHDH instance running on Openshift using Helm Chart
#### It is considered that a Helm installation of Red Hat Developer Hub is done by following the official documentation.

### To add/ enable the dynamic plugins

1. In the UI of the ROSA instance, navigate to the project.
2. Open `ConfigMap > dynamic-plugins`.
3. Add the following code:

```yaml
data:
  dynamic-plugins.yaml: |
    includes:
    - dynamic-plugins.default.yaml
    plugins:
    - disabled: false
      package: http://plugin-registry:8080/ansible-plugin-backstage-rhaap-x.y.z.tgz
      integrity: <integrity sha - download .integrity files from the alongside plugin release>
      pluginConfig:
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
    - disabled: false
      package: http://plugin-registry:8080/ansible-plugin-scaffolder-backend-module-backstage-rhaap-x.y.z.tgz
      integrity: <integrity sha - download .integrity files from the alongside plugin release>
      pluginConfig:
        dynamicPlugins:
          backend:
            ansible.plugin-scaffolder-backend-module-backstage-rhaap: null
    - disabled: false
      package: http://plugin-registry:8080/ansible-plugin-backstage-rhaap-backend-x.y.z.tgz
      integrity: <integrity sha - download .integrity files from the alongside plugin release>
      pluginConfig:
        dynamicPlugins:
          backend:
            ansible.plugin-backstage-rhaap-backend: null
    - disabled: false
      package: ./dynamic-plugins/dist/janus-idp-backstage-plugin-rbac
    - disabled: false
      package: ./dynamic-plugins/dist/backstage-plugin-catalog-backend-module-github-org-dynamic
    - disabled: false
      package: ./dynamic-plugins/dist/janus-idp-backstage-plugin-analytics-provider-segment
```

### Add the ansible-devtools-server in your project within the ROSA instance for the scaffolder plugin to work.

#### Steps specific to RHDH Helm installation with 1.2y.z releases-

In the ROSA instance from the UI go to the project open `Helm > <project-namespace>` and add the following

to enable `community-ansible-dev-tools` container image:

```yaml
upstream:
  backstage: |
    ...
    extraContainers:
      - command:
          - adt
          - server
        image: 'ghcr.io/ansible/community-ansible-dev-tools:latest'
        imagePullPolicy: IfNotPresent
        name: ansible-devtools-server
        ports:
          - containerPort: 8000
```

to enable  `ansible-automation-platform-25-ansible-dev-tools-rhel8` image:

Steps to get Red Hat registry authentication ready -
- Follow, Getting a Red Hat Login steps [here](https://access.redhat.com/RegistryAuthentication)
- Check your Registry Service Accounts [here](https://access.redhat.com/terms-based-registry/)
- Open your Token information > OpenShift Secret and download the pull-secrets.yml and rename it to `rhdh-secret-brew-registry.yml`
- Use the following command to add the secret `kubectl create -f rhdh-secret-brew-registry.yml --namespace=<YOUR_NAMESPACE>`

```yaml
upstream:
  backstage: |
    ...
    extraContainers:
      - command:
          - adt
          - server
        image: >-
          brew.registry.redhat.io/rh-osbs/ansible-automation-platform-25-ansible-dev-tools-rhel8:latest
        imagePullPolicy: IfNotPresent
        name: ansible-devtools-server
        ports:
          - containerPort: 8000
    image:  # do not create this entry this entry should be present in the Helm config
      pullPolicy: Always
      pullSecrets:
        - ...
        - rhdh-secret-brew-registry   # just this pull secret reference
      registry: registry.redhat.io
      repository: rhdh/rhdh-hub-rhel9
      tag: 1.2-105
```

#### Steps specific to RHDH Helm installation with 1.3y.z releases-

Edit the redhat-developer-hub pod from the redhat-developer-hub deployment, once we are in the Edit Deployment page.

Navigate to `spec.template.spec.[containers]` and now edit the containers list to add the desired sidecar container.

```yaml
spec:
  template:
    spec:
      containers:
        - ...
        - name: ansible-devtools-server
          image: 'ghcr.io/ansible/community-ansible-dev-tools:latest'
          command:
            - adt
            - server
          ports:
            - containerPort: 8000
              protocol: TCP
          resources: {}
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          imagePullPolicy: IfNotPresent
```

Do note that the configMap names may vary when it is a 1.3y.z release.

All configuration specific to app-config goes in - `ConfigMap > redhat-developer-hub-app-config`
 - catalog.locations
 - ansible (all)
 - auth
 - integrations
 - enabled
 - signInPage
 - permission (rbac)

This list is specific to Ansible Plugins.

Example -

```yaml
...
catalog:
  ...
  locations:
    - type: url
      target: https://github.com/ansible/ansible-rhdh-templates/blob/main/all.yaml
      rules:
        - allow: [Template]
ansible:
  devSpaces:
    baseUrl: '<DEVSPACES_URL>'
  creatorService:
    baseUrl: '127.0.0.1'
    port: '8000'
  rhaap:
    baseUrl: '<AAP_URL>'
    token: '<AAP_TOKEN>'
    checkSSL: false
auth:
  environment: development
  providers:
    ...
    github:
      development:
        clientId: '<APP_CLIENT_ID>'
        clientSecret: '<APP_SECRET>'
integrations:
  github:
    - host: github.com
      token: <TOKEN_GH>
...
permission:
  enabled: true
  rbac:
    admin:
      users:
        - name: user:default/gh-user
        ...
      superUsers:
        - name: user:default/gh-admin
        - name: user:default/gh-user
        ...
```

For dynamic plugins use the following - `ConfigMap > redhat-developer-hub-dynamic-plugins`

```yaml
...
data:
  dynamic-plugins.yaml: |
    includes:
    - dynamic-plugins.default.yaml
    plugins:
      - disabled: false
        package: 'http://plugin-registry:8080/ansible-plugin-backstage-rhaap-x.y.z.tgz'
        integrity: <Update_integrity_hash_here>
        pluginConfig:
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
      - disabled: false
        package: >-
          http://plugin-registry:8080/ansible-plugin-backstage-rhaap-backend-x.y.z.tgz
        integrity: <Update_integrity_hash_here>
        pluginConfig:
          dynamicPlugins:
            backend:
              ansible.plugin-backstage-rhaap-backend: null
      - disabled: false
        package: >-
          http://plugin-registry:8080/ansible-plugin-scaffolder-backend-module-backstage-rhaap-x.y.z.tgz
        integrity: <Update_integrity_hash_here>
        pluginConfig:
          dynamicPlugins:
            backend:
              ansible.plugin-scaffolder-backend-module-backstage-rhaap: null
      - package: './dynamic-plugins/dist/backstage-plugin-catalog-backend-module-github-dynamic'
        disabled: false
        pluginConfig:
          catalog:
            providers:
              github:
                myorg:
                  organization: '<GITHUB_ORG_NAME>'
                  schedule:
                    # supports cron, ISO duration, "human duration" (used below)
                    frequency: { minutes: 30}
                    # supports ISO duration, "human duration (used below)
                    timeout: { minutes: 3}
                    initialDelay: { seconds: 15}
      - disabled: false
        package: ./dynamic-plugins/dist/janus-idp-backstage-plugin-rbac
      - disabled: false
        package: >-
          ./dynamic-plugins/dist/janus-idp-backstage-plugin-analytics-provider-segment
```


### Add analytics service configuration in your RHDH ROSA instance for the plugins

The analytics/ telemetry capabilities are enabled with the RHDH build, for specific settings please follow this [doc](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.2/html-single/administration_guide_for_red_hat_developer_hub/index#disabling-telemetry-data-collection_assembly-install-rhdh-ocp)

Details about the analytics gathered by Ansible plugins are -

* If the event originates from the Ansible plugin:
 * Capture Ansible-specific events -
   * Events are filtered by subject, plugin_id and attributes that are related to Ansible.
 * Analytics are captured from feedback form and sentiment data.
* If the event does not originate from the Ansible plugin:
 * Analytics are captured from Catalog item, On click events to the 'Open Ansible project in OpenShift Dev Spaces' button.
 * Analytics are captured in the Create page Click/Navigate events for 'Choose' button to select an Ansible template.
 * Analytics are captured in the template input form after clicking 'Choose' and clicking events for the 'Review' button for Ansible software template.
 * Analytics are captured in the Confirmation page on clicking events for 'Create' button for an Ansible software template.

### Add template configurations to your RHDH ROSA instance for the plugins

1. In the UI of the ROSA instance, navigate to the project.
2. Open `ConfigMap > <project-namespace>-app-config`.
3. Add the following code:

```yaml
data:
  app-config.yaml: |
    catalog:
      ...
      locations:
        ...
        - type: url
          target: https://github.com/ansible/ansible-rhdh-templates/blob/main/all.yaml
          rules:
            - allow: [Template]
```

Note - if there is a need for a custom SCM support a fork of the above repo can be made with a set of changes mentioned below.
- Update the enum and enum name in the templates [ref](https://github.com/ansible/ansible-rhdh-templates/blob/main/templates/collections.yaml#L29) to the desired source control name and source control URL.
- Use a suitable publish action for the source control being used.

### Add ansible configuration in your RHDH ROSA instance for the plugins

In the ROSA instance from the UI go to the project open `ConfigMap > <project-namespace>-app-config` add the following

```yaml
data:
  app-config.yaml: |
    ...
    ansible:
      automationHub:
        baseUrl: '<https://MyAutomationHubUrl/>'
      devSpaces:
        baseUrl: '<https://MyOwnDevSpacesUrl/>'
      creatorService:
        baseUrl: '127.0.0.1'
        port: '8000'
      rhaap:
        baseUrl: '<https://MyAapSubcriptionUrl>'
        token: '<TopSecretAAPToken>'
        checkSSL: true
```

### Add RBAC configuration in your RHDH ROSA instance

In the ROSA instance from the UI go to the project open `ConfigMap > <project-namespace>-app-config` add the following

```yaml
data:
  app-config.yaml: |
    plugins:
      - disabled: false
        package: ./dynamic-plugins/dist/janus-idp-backstage-plugin-rbac
    ...
    permission:
      enabled: true
      rbac:
        admin:
          users:
            - name: user:default/<user-scm-ida>
            - name: user:default/<user-scm-idb>
          superUsers:
            - name: user:default/<user-scm-ida>
```
Upon upgrading the ConfigMaps and Helm chart configuration, by clicking on Upgrade the RHDH pod would redeploy with loaded plugins

It is advised to use the latest available plugin version that can be found under release artifacts.

## Installing Ansible plugins with RHDH (1.2) instance running on Openshift using Operator

- Follow the Operator installation steps for the RHDH instance (pause at the namespaces section).
- With the clean namespace before Operator Backed is being used to install RHDH operator.
- Take a backup of the configMap `backstage-default-config` in the namespace that defaults to `rhdh-operator`
- Use the following commands
```bash
export KUBECONFIG=/…/ROSA/kubeconfig
oc get configmap backstage-default-config -n rhdh-operator -o yaml > backupOfRhdhOperatorConfig
```
- Follow steps to create a httpd container registry, steps are at the beginning of this document.
- `backupOfRhdhOperatorConfig` access the back up and copy the `deployment.yaml: |-` section
- Create a config map named `showcase-config`
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: showcase-config
data:
  deployment.yaml: |-
    ... # this is where the sidecar container also needs to be added, basically append it to the copied content
            - resources: {}
              terminationMessagePath: /dev/termination-log
              name: ansible-devtools-server
              command:
                - adt
                - server
              ports:
                - containerPort: 8000
                  protocol: TCP
              imagePullPolicy: IfNotPresent
              terminationMessagePolicy: File
              image: 'ghcr.io/ansible/community-ansible-dev-tools:latest'
```
- Make sure the sidecar container is added as a new entry in the `spec.template.spec.[containers].<entryForSideCar>`
- Create a config map named `my-backstage-config-auth`, the name can be anything. In RHDH (1.3) if should have a default entry `
backstage-appconfig-developer-hub`
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: my-backstage-config-auth
data:
  app-config-appropriate.yaml: |
    app:
      baseUrl: <RHDH_BASE_ROUTE>
    backend:
      auth:
        externalAccess:
          - type: legacy
            options:
              subject: legacy-default-config
              secret: "${BACKEND_SECRET}"
      baseUrl: <RHDH_BASE_ROUTE>
      cors:
        origin: <RHDH_BASE_ROUTE>
    ...
    catalog:
      ...
      locations:
        - type: url
          target: https://github.com/ansible/ansible-rhdh-templates/blob/main/all.yaml
          rules:
            - allow: [Template]
    ansible:
      devSpaces:
        baseUrl: '<DEVSPACES_URL>'
      creatorService:
        baseUrl: '127.0.0.1'
        port: '8000'
      rhaap:
        baseUrl: '<AAP_URL>'
        token: '<AAP_TOKEN>'
        checkSSL: false
    auth:
      environment: development
      providers:
        ...
        github:
          development:
            clientId: '<APP_CLIENT_ID>'
            clientSecret: '<APP_SECRET>'
    integrations:
      github:
        - host: github.com
          token: <TOKEN_GH>
    ...
    permission:
      enabled: true
      rbac:
        admin:
          users:
            - name: user:default/gh-user
            ...
          superUsers:
            - name: user:default/gh-admin
            - name: user:default/gh-user
            ...
```
- Create a config map named `my-dynamic-plugins-config-cm`, the name can be anything. In RHDH (1.3) if should have a default entry `backstage-dynamic-plugins-developer-hub`
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: my-dynamic-plugins-config-cm
data:
  dynamic-plugins.yaml: |
    includes:
      - dynamic-plugins.default.yaml
    plugins:
      - disabled: false
        package: 'http://plugin-registry:8080/ansible-plugin-backstage-rhaap-x.y.z.tgz'
        integrity: <Update_integrity_hash_here>
        pluginConfig:
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
      - disabled: false
        package: >-
          http://plugin-registry:8080/ansible-plugin-backstage-rhaap-backend-x.y.z.tgz
        integrity: <Update_integrity_hash_here>
        pluginConfig:
          dynamicPlugins:
            backend:
              ansible.plugin-backstage-rhaap-backend: null
      - disabled: false
        package: >-
          http://plugin-registry:8080/ansible-plugin-scaffolder-backend-module-backstage-rhaap-x.y.z.tgz
        integrity: <Update_integrity_hash_here>
        pluginConfig:
          dynamicPlugins:
            backend:
              ansible.plugin-scaffolder-backend-module-backstage-rhaap: null
      - package: './dynamic-plugins/dist/backstage-plugin-catalog-backend-module-github-dynamic'
        disabled: false
        pluginConfig:
          catalog:
            providers:
              github:
                myorg:
                  organization: '<GITHUB_ORG_NAME>'
                  schedule:
                    # supports cron, ISO duration, "human duration" (used below)
                    frequency: { minutes: 30}
                    # supports ISO duration, "human duration (used below)
                    timeout: { minutes: 3}
                    initialDelay: { seconds: 15}
      - disabled: false
        package: ./dynamic-plugins/dist/janus-idp-backstage-plugin-rbac
      - disabled: false
        package: >-
          ./dynamic-plugins/dist/janus-idp-backstage-plugin-analytics-provider-segment
```
- Once the config maps are created, we can stich things together while we create the RHDH operator instance.
```yaml
apiVersion: rhdh.redhat.com/v1alpha1
kind: Backstage
metadata:
  name: developer-hub
spec:
  application:
    appConfig:
      configMaps:
        - name: my-backstage-config-auth # our custom configMap for app config
      mountPath: /opt/app-root/src
    dynamicPluginsConfigMapName: my-dynamic-plugins-config-cm # our custom configMap for dynamic plugins
    replicas: 2
  database:
    enableLocalDb: true
  rawRuntimeConfig:
    backstageConfig: showcase-config # the showcase config that was created with the backup configuration
```
- Now click on create. And things should be good!
