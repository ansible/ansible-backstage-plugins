export interface Config {
  catalog?: {
    providers?: {
      rhaap?: Record<string, unknown>;
      'self-service-ee'?: Record<string, unknown>;
    };
  };
}
