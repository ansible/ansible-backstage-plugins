import {
  GithubIntegrationConfig,
  GitLabIntegrationConfig,
} from '@backstage/integration';

export type Organization = {
  id: number;
  name: string;
  namespace?: string;
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
  related?: {
    last_job: string;
  };
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
  template: string;
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

export type DevSpaces = {
  baseUrl?: string;
};

export type AutomationHub = {
  baseUrl?: string;
};

export type ShowCaseLocation = {
  type?: 'url' | 'file';
  target?: string;
  gitBranch?: string;
  gitUser?: string;
  gitEmail?: string;
};

export type CreatorService = {
  baseUrl: string;
  port: string;
};

export type FeedbackConfig = {
  enabled?: boolean;
};

export type RHAAPConfig = {
  baseUrl?: string;
  token?: string;
  checkSSL?: boolean;
  showCaseLocation?: ShowCaseLocation;
};

export type CatalogConfig = {
  organizations: string[];
  surveyEnabled: boolean | undefined;
  jobTemplateLabels: string[];
  jobTemplateExcludeLabels: string[];
};

export type AnsibleConfig = {
  devSpaces?: DevSpaces;
  automationHub?: AutomationHub;
  rhaap?: RHAAPConfig;
  githubIntegration?: GithubIntegrationConfig;
  gitlabIntegration?: GitLabIntegrationConfig;
  creatorService?: CreatorService;
  feedback?: FeedbackConfig;
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

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
};

export type PaginatedResponse = {
  count: number;
  next: string;
  previous: string;
  results: [];
};

export type User = {
  id: number;
  url: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  is_orguser?: boolean;
};

export type Users = User[];

export type Team = {
  id: number;
  name: string;
  organization: number;
  description: string;
  groupName: string;
};

export type RoleAssignment = Record<string, (string | number)[]>;
export type RoleAssignments = Record<number, RoleAssignment>;

export type SummaryField = {
  role_definition: {
    id: number;
    name: string;
  };
};

export type RoleAssignmentResponse = {
  user: number;
  object_id: string | number;
  summary_fields: SummaryField;
};
