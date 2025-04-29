# RHDH-Ansible-Tests

Tests for RHDH Ansible Plugin and Ansible self-service

# Getting Started

To start the tests, run:

```sh
yarn install
```

## Run Tests

Before running the tests, make sure to update the necessary environment variable values in `cypress.config.ts`. The common value that needs to be changed is `base_url` under the `e2e` section. Additionally, specific environment variables should be updated where indicated with `// changeme before running self-service tests` or `// changeme before running rhdh tests`, depending on the type of tests being executed.

`yarn cy:open`: Open Cypress and start the test server

`yarn e2e`: Run all tests

`yarn e2e:self-service`: Run only self-service tests

`yarn e2e:rhdh`: Run only rhdh tests
