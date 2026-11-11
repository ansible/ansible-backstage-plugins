/** sessionStorage key: resume EE build dialog after SCM OAuth redirect/reload */
export const EE_BUILD_PENDING_SESSION_KEY = 'self-service.ee-build.pending';

export const EE_BUILD_PENDING_MAX_AGE_MS = 15 * 60 * 1000;

export type EeBuildPendingPayload = {
  entityRef: string;
  savedAt: number;
};
