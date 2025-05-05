# catalog-backend-module-rhaap

The catalog-backend-module-rhaap plugin synchronizes users from AAP into RHDH / Ansible Self-Service.

## Installation

Build plugin as a dynamic plugin.
Then configure your RHDH to load tar.gz with the plugin.

### AAP, Create token

Plugin needs access to AAP. Create a token as admin user:

- AAP UI, top left corner, click username, User details
- Select tab Tokens, click Create token
- Required properties:
  - OAuth application: leave empty
  - Scope: read

Use token value as `AAP_TOKEN`

### RHDH

Fragment for `app-config.local.yaml`:

```yaml
catalog:
  providers:
    rhaap:
      dev:
        schedule:
          frequency: { minutes: 30 }
          timeout: { seconds: 5 }
        orgs: Default
ansible:
  rhaap:
    baseUrl: { $AAP_URL }
    token: { $AAP_TOKEN }
    checkSSL: false
```
