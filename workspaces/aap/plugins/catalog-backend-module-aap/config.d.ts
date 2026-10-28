export interface Config {
  catalog?: {
    providers?: {
      rhaap?: Record<string, unknown>;
    };
  };
}
