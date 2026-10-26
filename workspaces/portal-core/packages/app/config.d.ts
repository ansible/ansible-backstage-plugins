export interface Config {
  portal?: {
    development?: {
      /** Bundled native contributors in the source development app only.
       * Full preserves the default; core omits scaffolder and APME.
       * @visibility frontend
       */
      profile?: 'full' | 'scaffolder' | 'core';
    };
  };
}
