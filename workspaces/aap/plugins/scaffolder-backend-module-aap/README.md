# scaffolder-backend-module-aap

AAP integration scaffolder backend module for the Backstage scaffolder plugin.

Registers the following into the Backstage scaffolder:

**Template actions:**

| Action ID | Description |
| --- | --- |
| `rhaap:create-project` | Create a project in AAP |
| `rhaap:create-execution-environment` | Create an execution environment in AAP |
| `rhaap:create-job-template` | Create a job template in AAP |
| `rhaap:launch-job-template` | Launch a job template in AAP |
| `rhaap:clean-up` | Clean up resources in AAP |

**Template filters:** `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter`

**Autocomplete provider:** `aap-api-cloud` — serves AAP resource data for scaffolder field extensions.

## Installation

```ts
// packages/backend/src/index.ts
backend.add(import('@ansible/plugin-scaffolder-backend-module-aap'));
```

## Configuration

```yaml
ansible:
  rhaap:
    baseUrl: ${AAP_URL}
    token: ${AAP_TOKEN}
    checkSSL: false
```
