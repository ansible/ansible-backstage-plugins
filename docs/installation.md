## Local Testing with [Backstage](https://backstage.io)

To start the app locally, run:

```sh
./install-deps
```

This installs workspace dependencies, the pre-commit CLI (for Husky git hooks), and runs an initial type check.

Once the install step is done update `app-config.yaml` file with changes to `integrations.github.token` and other settings which are mentioned as `changeme`.

Then start the project with

```sh
yarn start
```
