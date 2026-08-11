/**
 * The capability ID used when authorizing APME settings permissions.
 * Used as `resourceRef` in both `RequirePermission` (frontend) and
 * `permissions.authorize` (backend) calls for `ansible.settings.edit`
 * and `ansible.settings.view`.
 */
export const APME_SETTINGS_CAPABILITY = 'apme' as const;
