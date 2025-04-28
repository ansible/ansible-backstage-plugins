import {
  GithubIntegrationConfig,
  GitLabIntegrationConfig,
} from '@backstage/integration';

export type Organization = {
  id: number;
  name: string;
};

export type Inventory = {
  id: number;
  name: string;
};

export type Credential = {
  id: number;
  name: string;
  kind: string;
  inputs?: {
    username: string;
  };
};

export type Project = {
  id?: number;
  projectName: string;
  projectDescription?: string;
  organization: Organization;
  scmUrl: string;
  scmBranch?: string;
  scmUpdateOnLaunch?: boolean;
  status?: string;
  url?: string;
  credentials?: Credential;
};

export type ExecutionEnvironment = {
  id?: number;
  environmentName: string;
  environmentDescription?: string;
  organization: Organization;
  image: string;
  pull: string;
  url?: string;
};

export type JobTemplate = {
  id?: number;
  templateName: string;
  templateDescription?: string;
  scmType?: string;
  project: Project;
  organization: Organization;
  jobInventory: Inventory;
  playbook: string;
  executionEnvironment?: ExecutionEnvironment;
  extraVariables?: string | object;
  status?: string;
  url?: string;
  credentials?: Credential;
};

export type CleanUp = {
  project?: Project;
  executionEnvironment?: ExecutionEnvironment;
  template?: JobTemplate;
};

export type LaunchJobTemplate = {
  template: {
    id: number;
    name: string;
  };
  jobType?: 'run' | 'check';
  inventory?: Inventory;
  executionEnvironment?: ExecutionEnvironment;
  credentials?: {
    id: number;
    type: string;
    credential_type: number;
    name: string;
    summary_fields: Record<string, { id: number; name: string }>;
  }[];
  forks?: number;
  limit?: string;
  verbosity?: {
    id: number;
    name: string;
  };
  jobSliceCount?: number;
  timeout?: number;
  diffMode?: boolean;
  extraVariables?: string | object;
  jobTags?: string;
  skipTags?: string;
};

export type UseCase = {
  name: string;
  version: string;
  url: string;
};

export type AAPTemplate = {
  id: number;
  name: string;
};

export type ShowCaseLocation = {
  type: 'url' | 'file';
  target: string;
  gitBranch?: string;
  gitUser?: string;
  gitEmail?: string;
};

export type AnsibleConfig = {
  baseUrl: string;
  checkSSL?: boolean;
  : ShowCaseLocation;
  githubIntegration: GithubIntegrationConfig;
  gitlabIntegration: GitLabIntegrationConfig;
};

export type CreatedTemplate = {
  templateName: string;
  template: any;
  templateId?: number;
};
export type ParsedTemplate = {
  filename: string;
  fileContent: string;
};

// BackstageTemplate?
export type BackstageAAPShowcase = {
  apiVersion: string;
  kind: string;
  metadata: { name: string; description: string };
  spec: { targets: string[] };
};
