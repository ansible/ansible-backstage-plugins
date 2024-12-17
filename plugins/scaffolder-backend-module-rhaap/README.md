# scaffolder-backend-module-rhaap

The scaffolder-backend-module-rhaap is responsible to create objects in AAP.

## Installation

Build plugin as a dynamic plugin.
Then configure your RHDH to load tar.gz with the plugin.

### RHDH configuration

Fragment for `app-config.local.yaml`:

```yaml
catalog:
  stitchingStrategy:
    immediate: true
  orphanStrategy: delete
  processingInterval: { seconds: 10 }
  pollingInterval: { seconds: 1 }
  stitchTimeout: { minutes: 1 }
  import:
    entityFilename: catalog-info.yaml
    pullRequestBranchName: backstage-integration
  rules:
    - allow:
        [Component, System, Group, Resource, Location, Template, API, Users]
  locations:
    - type: url
      # 
      # target: https://github.com//blob/main/all.yaml
      # 
      target: https://github.com//blob/ansible-patterns/all.yaml
      # 
      # target: https://github.com/ansible/ansible-rhdh-templates/blob/ansible-patterns/all.yaml
      rules:
        - allow: [Template]
    - type: file
      target: all.yaml
      rules:
        - allow: [Template]
  providers:
    rhaap:
      dev:
        schedule:
          frequency: { minutes: 30 }
          timeout: { seconds: 5 }
ansible:
  rhaap:
    baseUrl: { $AAP_URL }
    checkSSL: false
    :
      type: file
      target: ''
      # Use cases on github:
      #type: url
      #target: https://github.com/kcagran/test-templates
      #githubBranch: main
      #githubUser: { $GITHUB_USER }
      #githubEmail: { $GITHUB_EMAIL }
# If showcase location type is url:
#integrations:
#  github:
#    - host: github.com
#      token: { $GITHUB_TOKEN}
```
