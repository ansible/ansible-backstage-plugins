/**
 * Represents a collection version returned by the Private Automation Hub (PAH)
 * collection-versions search API, as normalized by getCollectionsByRepositories.
 */
export interface Collection {
  /** Collection namespace (e.g. "ansible"). */
  namespace: string;
  /** Collection name (e.g. "posix"). */
  name: string;
  /** Semantic version of the collection, or null if not provided. */
  version: string | null;
  /** Dependency specifiers (namespace.name -> version range), or null. */
  dependencies: Record<string, string> | null;
  /** Human-readable description, or null. */
  description: string | null;
  /** Tags (e.g. "cloud", "networking"), or null. */
  tags: string[] | null;
  /** Name of the PAH repository this collection version was found in. */
  repository_name: string;
  /** HTML content of the collection README, or null if not fetched. */
  collection_readme_html: string | null;
  /** List of author names, or null. */
  authors: string[] | null;
}
