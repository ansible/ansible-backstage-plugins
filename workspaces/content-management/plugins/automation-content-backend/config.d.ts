export interface Config {
  automationContent?: {
    manualSync?: {
      /**
       * Allows authorized users to request manual registry reconciliation.
       * Requires separate, durable audit storage outside disposable local fixtures.
       * @visibility backend
       * @default false
       */
      enabled?: boolean;
    };
  };
}
