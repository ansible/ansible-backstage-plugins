# scaffolder-backend-module-self-service

Self-service scaffolder backend module for the Backstage scaffolder plugin.

Registers EE definition authoring and publish-related actions into the Backstage scaffolder.

**Template actions:**

| Action ID | Description |
| --- | --- |
| `ansible:content:create` | Scaffold Ansible content (collection or playbook project) via ansible-creator |
| `ansible:create:ee-definition` | Create an Execution Environment definition with full lifecycle orchestration |
| `ansible:prepare:publish` | Check repository existence and prepare SCM publish metadata |

## Installation

```ts
// packages/backend/src/index.ts
backend.add(import('@ansible/plugin-scaffolder-backend-module-self-service'));
```

## Configuration

```yaml
ansible:
  devSpaces:
    baseUrl: 'https://devspaces.example.com/'
  creatorService:
    baseUrl: '127.0.0.1'
    port: '8000'
```
