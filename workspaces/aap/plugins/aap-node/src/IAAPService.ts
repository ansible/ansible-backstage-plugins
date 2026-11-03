import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  OAuthAuthenticatorResult,
  PassportProfile,
} from '@backstage/plugin-auth-node';
import type {
  AAPTemplate,
  CleanUp,
  Collection,
  ExecutionEnvironment,
  IJobTemplate,
  InstanceGroup,
  ISurvey,
  JobTemplate,
  LaunchJobTemplate,
  Organization,
  Project,
  RoleAssignments,
  Team,
  User,
  Users,
} from '@ansible/aap-common';

/**
 * Standalone AAP service contract for backend DI.
 *
 * Declared independently of `AAPClient` (which implements this interface) so
 * `@ansible/aap-node` does not depend on the concrete HTTP client package.
 * All 37 methods are retained during the PAH/content transition, including
 * `isValidPAHRepository` and `syncCollectionsByRepositories`.
 *
 * @public
 */
export interface IAAPService {
  executePostRequest(
    endPoint: string,
    token?: string,
    data?: any,
    auth?: boolean,
  ): Promise<any>;

  executeGetRequest(
    endPoint: string,
    token: string | null,
    fullUrl?: string,
  ): Promise<any>;

  executeDeleteRequest(endPoint: string, token: string): Promise<any>;

  getProject(projectID: number, token: string): Promise<Project>;

  deleteProject(projectID: number, token: string): Promise<any>;

  deleteProjectIfExists(
    name: string,
    organization: Organization,
    token: string,
  ): Promise<void>;

  createProject(
    payload: Project,
    deleteIfExist: boolean,
    token: string,
  ): Promise<Project>;

  deleteExecutionEnvironmentExists(name: string, token: string): Promise<void>;

  createExecutionEnvironment(
    payload: ExecutionEnvironment,
    token: string,
    deleteIfExist?: boolean,
  ): Promise<ExecutionEnvironment>;

  deleteExecutionEnvironment(
    environmentID: number,
    token: string,
  ): Promise<any>;

  deleteJobTemplate(templateID: number, token: string): Promise<any>;

  deleteJobTemplateIfExists(
    name: string,
    organization: Organization,
    token: string,
  ): Promise<void>;

  createJobTemplate(
    payload: JobTemplate,
    deleteIfExist: boolean,
    token: string,
  ): Promise<JobTemplate>;

  fetchEvents(
    jobID: number,
    token: string,
    results?: never[],
    fullUrl?: string,
  ): Promise<any>;

  fetchResult(
    jobID: number,
    token: string,
  ): Promise<{ jobEvents: any; jobData: any }>;

  launchJobTemplate(
    payload: Omit<LaunchJobTemplate, 'token'>,
    token: string,
  ): Promise<any>;

  launchJobTemplateNoWait(
    payload: Omit<LaunchJobTemplate, 'token'>,
    token: string,
  ): Promise<{ id: number; status: string; url: string; launchedAt: string }>;

  logJobStdoutMessages(
    jobID: number,
    token: string,
  ): Promise<string | undefined>;

  getJobStatus(
    jobID: number,
    token: string,
  ): Promise<{
    id: number;
    status: string;
    events?: any[];
    url: string;
    finishedAt?: string;
  }>;

  cancelJob(jobID: number, token: string): Promise<void>;

  cleanUp(payload: CleanUp, token: string): Promise<void>;

  checkControllerAvailability(token: string): Promise<boolean>;

  getResourceData(resource: string, token: string): Promise<any>;

  getJobTemplatesByName(
    templateNames: string[],
    organization: Organization,
    token: string | null,
  ): Promise<AAPTemplate[]>;

  setLogger(logger: LoggerService): void;

  rhAAPAuthenticate(options: {
    host: string;
    checkSSL: boolean;
    clientId: string;
    clientSecret: string;
    callbackURL: string;
    code?: string;
    refreshToken?: string;
    codeVerifier?: string;
  }): Promise<OAuthAuthenticatorResult<PassportProfile>>;

  rhAAPRevokeToken(options: {
    clientId: string;
    clientSecret: string;
    token: string;
  }): Promise<void>;

  fetchProfile(token: string): Promise<PassportProfile>;

  getOrganizations(userAndTeamDetails?: boolean): Promise<
    Array<{
      organization: Organization;
      teams: Team[];
      users: User[];
    }>
  >;

  listSystemUsers(): Promise<Users>;

  getTeamsByUserId(userID: number): Promise<
    {
      name: string;
      groupName: string;
      id: number;
      orgId: number;
      orgName: string;
    }[]
  >;

  getUserRoleAssignments(): Promise<RoleAssignments>;

  syncJobTemplates(
    surveyEnabled: boolean | undefined,
    jobTemplateLabels: string[],
    jobTemplateExcludeLabels?: string[],
  ): Promise<
    {
      job: IJobTemplate;
      survey: ISurvey | null;
      instanceGroup: InstanceGroup[];
    }[]
  >;

  getOrgsByUserId(
    userID: number,
    organizations?: readonly string[],
  ): Promise<{ name: string; id: number; groupName: string }[]>;

  getUserInfoById(userID: number): Promise<User>;

  isValidPAHRepository(repositoryName: string): Promise<boolean>;

  syncCollectionsByRepositories(
    repositories: string[],
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Collection[]>;
}
