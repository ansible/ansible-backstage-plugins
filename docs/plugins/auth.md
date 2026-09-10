# auth-backend-module-rhaap-provider

The auth-backend-module-rhaap-provider is an authentication plugin for Red Hat Ansible Automation Platform (AAP) that enables OAuth2-based single sign-on (SSO) integration with Backstage.

## Overview

This plugin provides external authentication capabilities using AAP's OAuth2 implementation, allowing users to authenticate with Backstage using their existing AAP credentials.

**Note**: This plugin handles authentication only. For complete AAP integration, you also need:

- `catalog-backend-module-rhaap` for user/team synchronization
- Proper RBAC configuration for access control

For comprehensive setup and configuration instructions, see the [External Authentication Documentation](../features/external-authentication.md).

## Installation

Build plugin as a dynamic plugin. Then configure your RHDH to load tar.gz with the plugin.

## Configuration

### AAP, Create OAuth2 application

OAuth2 application needs to be created in the AAP.
Required properties:

- Organization: Default
- Authorization grant type: Authorization code
- Client type: confidential
- Redirect URIs: "https://RHDH_IP_OR_DNS_NAME/api/auth/rhaap/handler/frame"

### RHDH,

Fragment for `app-config.local.yaml`:

```yaml
enableExperimentalRedirectFlow: true
signInPage: rhaap
auth:
  environment: development
  providers:
    rhaap:
      host: { $AAP_URL }
      checkSSL: false
      clientId: { $AAP_OAUTH_CLIENT_ID }
      clientSecret: { $AAP_OAUTH_CLIENT_SECRET }
      signIn:
        resolvers:
          - resolver: usernameMatchingUser
```

## Detailed Documentation

For comprehensive configuration, troubleshooting, and advanced usage, see:

- [External Authentication Documentation](../features/external-authentication.md) - Complete setup and configuration guide
- [Home Template Listing](../features/home-template-listing.md) - Templates home page, `user-job-templates` API, and AAP session errors
- [Users, Teams, and Organizations Sync](../features/users-teams-organizations.md) - User catalog synchronization
- [Job Template Execution](../features/job-templates.md) - Executing AAP job templates with authenticated users
