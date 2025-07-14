## Local Testing with [Backstage](https://backstage.io)

To start the app locally, run:

```sh
./install-deps
```

Once the install step is done update `app-config.yaml` file with changes to `integrations.github.token` and other settings which are mentioned as `changeme`.

Then start the project with

```sh
yarn dev
```

## Test plugins for ansible experience

To test plugins for ansible experience you need:

- container image with authentication plugin for Red Hat AAP
- built plugins for ansible experince

The container image and built plugins are tested using  repo.

You also need to create token and OAuth2 app in AAP.
Instructions in individual plugin pages.

- AAP token, see steps [here](plugins/catalog.md#aap-create-token).
- AAP OAuth2 app, see steps [here](plugins/auth.md#aap-create-oauth2-application)

### Obtain container image

There are two options, choose one.

#### Pull prebuild image

Use the official release of RHDH 1.5:

```bash
docker pull :1.5
```

Note: If you're using an Apple Silicon (M1/M2) Mac, the default RHDH image (`:1.4`) is not compatible with the ARM64 architecture. Instead use the rhdh-community image:

```bash
docker pull quay.io/rhdh-community/rhdh:next
```

#### Build locally

Note - we build using podman (Dockerfile has more that 127 layers, and overlay2 filesystem cannot be used).

```bash
git clone git@github.com:.git
cd rhdh

podman build -f docker/Dockerfile . -t :local
```

### Build plugins

```bash
git clone git@github.com:ansible/ansible-backstage-plugins.git
cd ansible-backstage-plugins

cat <<EOF >pack_all_ansible_experience.sh
#!/bin/bash
git status
read -p "Check status, Ctrl+C to stop, Enter to continue..." blabla
echo -e '\n\n\n========================================= auth-backend-module-rhaap-provider'
./.github/actions/pack/pack_one.sh plugins/auth-backend-module-rhaap-provider
echo -e '\n\n\n========================================= catalog-backend-module-rhaap'
./.github/actions/pack/pack_one.sh plugins/catalog-backend-module-rhaap
echo -e '\n\n\n========================================= scaffolder-backend-module-backstage-rhaap'
./.github/actions/pack/pack_one.sh plugins/scaffolder-backend-module-backstage-rhaap
echo -e '\n\n\n========================================= self-service'
./.github/actions/pack/pack_one.sh plugins/self-service
EOF

bash pack_all_ansible_experience.sh
ls -al 
```

### Start application with 

1. Clone the  repository to a location on your PC

   ```bash
   git clone https://github.com/redhat-developer/.git
   ```

1. Move to the `` folder.

   ```bash
   cd 
   ```

1. (Optional) You can create a local `.env` file and override any of the default variables defined in the `default.env` file provided. You can also add additional variables.
   In most cases, when you don't need GitHub Auth or testing different releases, you can skip this step, and it should work.

1. (Optional) Create local configuration overrides.

   RHDH Local supports user-specific configuration overrides using a structured `configs/` directory. You do not need to modify default files. However, if you want to customize your setup:
   - Add your app config overrides to: `configs/app-config/app-config.local.yaml`

     > You can use the included `.example.yaml` files to get started quickly:
     >
     > ```bash
     > cp configs/app-config/app-config.local.example.yaml configs/app-config/app-config.local.yaml
     > cp configs/dynamic-plugins/dynamic-plugins.override.example.yaml configs/dynamic-plugins/dynamic-plugins.override.yaml
     > ```

   - Add your plugin config overrides to:
     `configs/dynamic-plugins/dynamic-plugins.override.yaml`

     > The override file must start with:
     >
     > ```yaml
     > includes:
     >   - dynamic-plugins.default.yaml
     > ```
     >
     > This ensures the base plugin list is preserved and extended, rather than replaced.

   - Add any extra files (like GitHub credentials) to: `configs/extra-files/`

   If present, these files will be automatically loaded by the system on startup.

   If you need features that fetch files from GitHub you should configure `integrations.github`.
   The recommended way is to use GitHub Apps. You can find hints on how to configure it in github-app-credentials.example.yaml or a more detailed instruction in [Backstage documentation](https://backstage.io/docs/integrations/github/github-apps).

1. Start RHDH Local.
   This repository should work with either `docker compose` using Docker Engine or `` using Podman. When using Podman there are some exceptions.

   ```bash
    up -d
   ```

   If you prefer `docker compose` you can just replace `` with `docker compose`

   ```bash
   docker compose up -d
   ```

#### Changing Your Configuration

When you change `app-config.local.yaml` you must restart the `rhdh` container to load RHDH your updated configuration.

```bash
 stop rhdh &&  start rhdh
```

When you change `dynamic-plugins.yaml` you need to re-run the `install-dynamic-plugins` container and then restart RHDH instance.

```bash
 run install-dynamic-plugins
 stop rhdh &&  start rhdh
```

#### Loading dynamic plugins from a local directory

During boot, the `install-dynamic-plugins` container reads the contents of the plugin configuration file and activates, configures, or downloads any plugins listed. RHDH Local supports two ways of specifying dynamic plugin configuration:

1. Default path: `configs/dynamic-plugins/dynamic-plugins.yaml`

2. User override path: `configs/dynamic-plugins/dynamic-plugins.override.yaml` or `configs/dynamic-plugins.yaml` If present, this file will automatically override the default and be used by the `install-dynamic-plugins` container. `configs/dynamic-plugins/dynamic-plugins.override.yaml` takes precedence over `configs/dynamic-plugins.yaml`.

In addition, the `local-plugins` directory is mounted into the `install-dynamic-plugins` container at `/opt/app-root/src/local-plugins`. Any plugins placed there can be activated/configured the same way (without downloading).

To load dynamic plugins from your local machine:

1. Copy the dynamic plugin binary file into the `local-plugins` directory.
2. Make sure permissions allow the container to read the files (e.g. `chmod -R 777 local-plugins` for quick testing).
3. Configure your plugin in one of the supported config files:
   - Prefer `configs/dynamic-plugins/dynamic-plugins.override.yaml` for local user overrides.
   - If no override file is present, `configs/dynamic-plugins/dynamic-plugins.yaml` will be used.
