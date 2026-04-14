# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where versioned packages apply.

## [Unreleased]

### Added

- Scaffolder **payload normalization** (`rhaapActionPayloadUtils`, `parseAapActionValues`) so `rhaap:*` actions receive consistent shapes for launch and resource-creation flows, with expanded unit tests.
- **Survey → JSON Schema** improvements for catalog-generated job templates: multiselect / multiple-choice **choices** normalized to string arrays; multiselect **defaults** normalized (including newline-separated strings); safer **Nunjucks** parameter references for variable names that are not simple identifiers (`parameters[...]`, `secrets[...]`).
- Self-service **Create Task** flow: clearer **review** display for nested objects; **sessionStorage** may retain bounded **`data:`** URLs across OAuth redirect so typical file uploads are not cleared (very large payloads may still be dropped to respect storage limits; **`blob:`** URLs remain cleared on reload).

### Changed

- **Catalog backend HTTP routes** (superuser manual sync triggers on the catalog plugin router):
  - **Removed:** `GET .../aap/sync_orgs_users_teams`, `GET .../aap/sync_job_templates`
  - **Use instead:** `GET .../ansible/sync/from-aap/orgs_users_teams`, `GET .../ansible/sync/from-aap/job_templates`
    The bundled self-service client was updated; custom scripts or integrations must call the new paths.
- **Create Task** final submit passes the AAP OAuth token **only** in scaffolder **`secrets`** as **`aapToken`**. It is no longer duplicated into template **`values.token`**. Templates should pass the token into actions explicitly, e.g. `token: ${{ secrets.aapToken }}` on `rhaap:*` steps (aligned with the `AAPTokenField` pattern).
- **Loose scaffolder `values` schema:** a single exported **`launchJobTemplateValuesLooseSchema`** is shared across all `rhaap:*` actions (the former duplicate export name was removed).
- **Launch credential normalization:** `credential_type` is only set when the type can be resolved from the credential or its `summary_fields`; it is no longer defaulted to `0`, avoiding spurious duplicate-type detection when metadata is missing.

### Fixed

- **AAP resource picker** (self-service): selection handling and typing for single vs multi-select resource lists.
- Various **Sonar** / quality findings in catalog survey generation and UI components.

### Upgrade notes

1. **Custom callers** of catalog sync GET endpoints: update URLs as listed above.
2. **Template authors:** ensure `rhaap:launch-job-template` (and other `rhaap:*` actions that require `token`) use **`secrets.aapToken`** (or your chosen secret key) in the template YAML, not `parameters.token`, if you relied on values carrying the token.
