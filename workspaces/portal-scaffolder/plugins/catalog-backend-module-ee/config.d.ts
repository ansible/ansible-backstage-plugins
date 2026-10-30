/**
 * EE definition catalog module (`moduleId: ee`). Reserved for future
 * EE-specific provider settings; EE routes use catalog processing today.
 */
export interface Config {
  catalog?: {
    providers?: {
      ee?: Record<string, unknown>;
      rhaap?: Record<string, unknown>;
    };
  };
}
