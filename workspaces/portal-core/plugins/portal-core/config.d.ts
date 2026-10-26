export interface Config {
  portal?: {
    /** Exact installed NFS page path, relative to the app base URL.
     * Defaults to /self-service when installed. Unavailable or invalid
     * destinations display the host fallback; permissions remain page-owned.
     * @visibility frontend
     */
    landingPage?: string;
    navigation?: {
      /** Ordered links and expandable groups. Missing plugin pages are omitted.
       * @deepVisibility frontend
       */
      items?: Array<{
        id: string;
        title?: string;
        /** Reference a discovered NFS page extension ID, or use path instead. */
        page?: string;
        path?: string;
        placement?: 'primary' | 'bottom';
        /** Groups require a title and cannot also specify page or path. */
        children?: Array<{
          id: string;
          title?: string;
          page?: string;
          path?: string;
        }>;
      }>;
      /** Space for a fixed host header, in pixels. Defaults to zero.
       * @visibility frontend
       */
      topOffset?: number;
      /** Exact routes shown in the opt-in Portal sidebar, in display order.
       * @visibility frontend
       */
      paths?: string[];
      /** Subset of allowed paths pinned below the main navigation.
       * @visibility frontend
       */
      bottomPaths?: string[];
    };
  };
}
