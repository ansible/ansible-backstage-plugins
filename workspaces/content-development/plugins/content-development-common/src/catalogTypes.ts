export type SourceVersionDetail = {
  source?: string;
  ref: string;
  version: string | null;
  label: string;
  name?: string;
};

export type Collections = {
  name: string;
  id?: number;
  versions?: SourceVersionDetail[];
  sources?: string[];
  sourceVersions?: Record<string, string[]>;
};
