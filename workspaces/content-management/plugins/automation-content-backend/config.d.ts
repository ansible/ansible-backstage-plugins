export interface Config {
  automationContent?: {
    manualSync?: {
      /**
       * Allows authorized users to request manual registry reconciliation.
       * @visibility backend
       * @default true
       */
      enabled?: boolean;
    };
  };
}
