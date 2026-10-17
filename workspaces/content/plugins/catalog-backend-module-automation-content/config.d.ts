export interface Config {
  catalog?: {
    providers?: {
      /**
       * Discovers Ansible automation content from OCI-compliant registries.
       * Adding a registry is configuration, never code.
       */
      automationContent?: {
        /** Default owner for emitted entities. */
        owner?: string;
        registries: Array<{
          /** Stable identifier, used in entity annotations. */
          name: string;
          /** Base URL including scheme. */
          url: string;
          /** Namespaces to enumerate. Requires registry catalog-listing support. */
          namespaces?: string[];
          /**
           * Explicit repositories. Required when the registry does not support
           * catalog enumeration.
           */
          repositories?: string[];
          auth?: {
            type?: 'anonymous' | 'basic' | 'bearer';
            username?: string;
            /** @visibility secret */
            password?: string;
            /** @visibility secret */
            token?: string;
          };
          /** Allow plain HTTP. Local development only. */
          insecure?: boolean;
          /**
           * Rewrite the bearer-auth realm host to match `url`. Needed when a registry
           * advertises a token endpoint on a hostname the portal cannot reach, such as
           * a registry configured as localhost but accessed from a container.
           */
          rewriteAuthRealmHost?: boolean;
          owner?: string;
          system?: string;
        }>;
      };
    };
  };
}
