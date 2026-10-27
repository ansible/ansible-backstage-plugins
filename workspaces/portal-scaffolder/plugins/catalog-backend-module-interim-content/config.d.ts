export interface Config {
  catalog?: {
    providers?: {
      rhaap?: Record<string, unknown>;
      'interim-content'?: Record<string, unknown>;
    };
  };
}
