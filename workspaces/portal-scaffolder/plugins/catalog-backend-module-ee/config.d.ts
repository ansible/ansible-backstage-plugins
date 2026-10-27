/**
 * EE definition catalog module (`moduleId: self-service-ee`). Reserved for future
 * EE-specific provider settings; EE routes use catalog processing today.
 */
export interface Config {
  catalog?: {
    providers?: {
      'self-service-ee'?: Record<string, unknown>;
      rhaap?: Record<string, unknown>;
    };
  };
}
