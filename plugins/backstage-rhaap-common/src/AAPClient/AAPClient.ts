import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';

import * as YAML from 'yaml';
import { Agent, fetch } from 'undici';
import {
  OAuthAuthenticatorResult,
  PassportProfile,
} from '@backstage/plugin-auth-node';
import { AuthenticationError } from '@backstage/errors';
import uniqBy from 'lodash.uniqby';
import {
  AAPTemplate,
  CleanUp,
  ExecutionEnvironment,
  JobTemplate,
  LaunchJobTemplate,
  LaunchWorkflowJobTemplate,
  WorkflowJobLaunchResult,
  Organization,
  Project,
  AnsibleConfig,
  TokenResponse,
  PaginatedResponse,
  RoleAssignmentResponse,
  RoleAssignments,
  Team,
  User,
  Users,
  CatalogConfig,
} from '../types';
import {
  IJobTemplate,
  IWorkflowJobTemplate,
  Collection,
  ISurvey,
  InstanceGroup,
} from '../interfaces';

import { getAnsibleConfig, getCatalogConfig } from './utils/config';
import {
  PAHHelperContext,
  sanitizePAHLimit,
  validateAndFilterRepositories,
  appendCollectionsFromPage,
  fetchCollectionsPage,
  extractNextUrl,
} from './pahHelpers';

export interface IAAPService extends Pick<
  AAPClient,
  | 'executePostRequest'
  | 'executeGetRequest'
  | 'executeDeleteRequest'
  | 'getProject'
  | 'deleteProject'
  | 'deleteProjectIfExists'
  | 'createProject'
  | 'deleteExecutionEnvironmentExists'
  | 'createExecutionEnvironment'
  | 'deleteExecutionEnvironment'
  | 'deleteJobTemplate'
  | 'deleteJobTemplateIfExists'
  | 'createJobTemplate'
  | 'fetchEvents'
  | 'fetchResult'
  | 'launchJobTemplate'
  | 'cleanUp'
  | 'getResourceData'
  | 'getJobTemplatesByName'
  | 'setLogger'
  | 'rhAAPAuthenticate'
  | 'rhAAPRevokeToken'
  | 'fetchProfile'
  | 'getOrganizations'
  | 'listSystemUsers'
  | 'getTeamsByUserId'
  | 'getUserRoleAssignments'
  | 'syncJobTemplates'
  | 'syncWorkflowJobTemplates'
  | 'launchWorkflowJobTemplate'
  | 'getWorkflowJobDetail'
  | 'listWorkflowJobNodes'
  | 'listWorkflowJobTemplateNodes'
  | 'getJobStdoutText'
  | 'getOrgsByUserId'
  | 'getUserInfoById'
  | 'isValidPAHRepository'
  | 'syncCollectionsByRepositories'
> {}

export class AAPClient implements IAAPService {
  static readonly pluginLogName = 'backstage-rhaap-common';
  private readonly config: Config;
  private readonly ansibleConfig: AnsibleConfig;
  private readonly catalogConfig: CatalogConfig;
  private readonly proxyAgent: Agent;
  private readonly pluginLogName: string;
  private logger: LoggerService;

  constructor(options: { rootConfig: Config; logger: LoggerService }) {
    this.pluginLogName = AAPClient.pluginLogName;
    this.config = options.rootConfig;
    this.ansibleConfig = getAnsibleConfig(this.config);
    this.catalogConfig = getCatalogConfig(this.config);
    this.logger = options.logger;
    this.proxyAgent = new Agent({
      connect: {
        rejectUnauthorized: this.ansibleConfig.rhaap?.checkSSL ?? true,
      },
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve, _reject) => {
      const timeoutId = setTimeout(() => {
        resolve(undefined);
        clearTimeout(timeoutId);
      }, ms);
    });
  }

  public setLogger(logger: LoggerService) {
    this.logger = logger;
  }

  private getBaseUrl() {
    // Normalize URL construction to avoid double slashes
    return this.ansibleConfig.rhaap?.baseUrl?.replace(/\/+$/, '') || '';
  }

  public async executePostRequest(
    endPoint: string,
    token?: string,
    data?: any,
    auth: boolean = false,
  ): Promise<any> {
    const normalizedEndPoint = endPoint.replace(/^\/+/, '');
    const url = `${this.getBaseUrl()}/${normalizedEndPoint}`;
    this.logger.info(
      `[${this.pluginLogName}]: Executing post request to ${url}.`,
    );

    let requestOptions;

    if (auth && !token) {
      requestOptions = {
        method: 'POST',
        dispatcher: this.proxyAgent,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: data,
      };
    } else {
      requestOptions = {
        method: 'POST',
        dispatcher: this.proxyAgent,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      };
    }

    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      this.logger.error(
        `[${this.pluginLogName}]: Failed to send POST request: ${error}`,
      );
      if (error instanceof Error) {
        throw new Error(`Failed to send POST request: ${error.message}`);
      } else {
        throw new Error(`Failed to send POST request`);
      }
    }
    if (!response.ok) {
      const errorOutput = await response.json();
      this.logger.error(
        `[${this.pluginLogName}] Failed to send POST request: ${response.statusText}`,
      );
      this.logger.error(
        `[${this.pluginLogName}] Error: ${JSON.stringify(errorOutput)}`,
      );
      if (response.status === 403) {
        throw new Error(
          `Insufficient privileges. Please contact your administrator.`,
        );
      } else {
        let errorResponse;
        try {
          errorResponse = await response.json();
        } catch {
          errorResponse = null;
        }
        if (errorResponse) {
          // @ts-ignore
          if (errorResponse?.__all__?.length) {
            // @ts-ignore
            throw new Error(errorResponse.__all__.join(' '));
          } else if (errorResponse.constructor === Object) {
            const errorData = Object.values(errorResponse);
            throw new Error(errorData.join(' '));
          } else {
            throw new Error(`Failed to post data`);
          }
        } else {
          throw new Error(`Failed to post data`);
        }
      }
    }
    return response;
  }

  public async executeGetRequest(
    endPoint: string,
    token: string | null,
    fullUrl?: string,
  ): Promise<any> {
    const baseUrl = this.getBaseUrl();
    let url: string;
    if (fullUrl) {
      const normalizedFullUrl = fullUrl.replace(/^\/+/, '');
      url = `${baseUrl}/${normalizedFullUrl}`;
    } else {
      const normalizedEndPoint = endPoint.replace(/^\/+/, '');
      url = `${baseUrl}/${normalizedEndPoint}`;
    }

    this.logger.info(
      `[${this.pluginLogName}]: Executing get request to ${url}.`,
    );
    const requestOptions = {
      method: 'GET',
      dispatcher: this.proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send fetch data: ${error.message}`);
      } else {
        throw new Error(`Failed to send fetch`);
      }
    }
    if (!response.ok) {
      this.logger.error(`[${this.pluginLogName}]: ${response.statusText}`);
      if (response.status === 403) {
        throw new Error(
          `Insufficient privileges. Please contact your administrator.`,
        );
      } else {
        throw new Error(`Failed to fetch data.`);
      }
    }
    return response;
  }

  public async executeDeleteRequest(
    endPoint: string,
    token: string,
  ): Promise<any> {
    const normalizedEndPoint = endPoint.replace(/^\/+/, '');
    const url = `${this.getBaseUrl()}/${normalizedEndPoint}`;
    this.logger.info(
      `[${this.pluginLogName}]: Executing delete request ${url}.`,
    );
    const requestOptions = {
      method: 'DELETE',
      dispatcher: this.proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      this.logger.error(
        `[${this.pluginLogName}]: Error while executing delete request: ${error}.`,
      );
      if (error instanceof Error) {
        throw new Error(`Failed to send delete: ${error.message}`);
      } else {
        throw new Error(`Failed to send delete`);
      }
    }
    if (!response.ok) {
      this.logger.error(
        `[${this.pluginLogName}]: Error while executing delete request ${response.status}.`,
      );
      if (response.status === 403) {
        throw new Error(
          'Insufficient privileges. Please contact your administrator.',
        );
      } else {
        throw new Error(`Failed to delete`);
      }
    }
    return response;
  }

  public async getProject(projectID: number, token: string): Promise<Project> {
    const endPoint = `api/controller/v2/projects/${projectID}/`;
    const project = await this.executeGetRequest(endPoint, token);
    return (await project.json()) as Project;
  }

  public async deleteProject(projectID: number, token: string): Promise<any> {
    const endPoint = `api/controller/v2/projects/${projectID}/`;
    return await this.executeDeleteRequest(endPoint, token);
  }

  public async deleteProjectIfExists(
    name: string,
    organization: Organization,
    token: string,
  ): Promise<void> {
    this.logger.info(
      `Check if project with name ${name} exist in organization ${organization.name}.`,
    );
    const endPoint = `api/controller/v2/projects/?organization=${organization.id}&name=${name}`;
    const projects = await this.executeGetRequest(endPoint, token);
    const projectList = await projects.json();
    if (projectList.results.length === 1) {
      this.logger.info(`Delete project with id: ${projectList.results[0].id}.`);
      await this.deleteProject(projectList.results[0].id, token);
      this.logger.info(
        `End delete project with id: ${projectList.results[0].id}.`,
      );
    }
  }

  public async createProject(
    payload: Project,
    deleteIfExist: boolean,
    token: string,
  ): Promise<Project> {
    if (deleteIfExist) {
      await this.deleteProjectIfExists(
        payload.projectName,
        payload.organization,
        token,
      );
    }
    const endPoint = 'api/controller/v2/projects/';
    const data = {
      name: payload.projectName,
      description: payload?.projectDescription ?? '',
      organization: payload.organization.id,
      scm_type: 'git',
      scm_url: payload.scmUrl,
      scm_branch: payload?.scmBranch ?? '',
      credential: payload.credentials?.id,
      scm_update_on_launch: payload.scmUpdateOnLaunch,
    };
    this.logger.info(`Begin creating project ${payload.projectName}.`);
    this.logger.info(
      `[${AAPClient.pluginLogName}] Creating new AAP project at ${this.ansibleConfig.rhaap?.baseUrl} in organization ${payload.organization.name}.`,
    );

    const response = await this.executePostRequest(endPoint, token, data);
    this.logger.info(`End creating project ${payload.projectName}.`);

    let projectData = (await response.json()) as Project;
    const waitStatuses = ['new', 'pending', 'waiting', 'running'];

    let projectStatus = projectData.status;
    this.logger.info(`Waiting for the project to be ready.`);
    if (projectStatus && waitStatuses.includes(projectStatus)) {
      let shouldWait = true;
      while (shouldWait && projectData.id !== undefined) {
        await this.sleep(2000);
        projectData = await this.getProject(projectData.id, token);
        projectStatus = projectData.status;
        if (!projectStatus || !waitStatuses.includes(projectStatus)) {
          shouldWait = false;
        }
      }
    }
    if (
      projectStatus &&
      ['failed', 'error', 'canceled'].includes(projectStatus)
    ) {
      this.logger.error(
        `[${this.pluginLogName}] Error creating project: ${projectStatus}`,
      );
      const stdoutEndPoint = `${projectData.related?.last_job}events`;
      const epResponse = await this.executeGetRequest(
        stdoutEndPoint,
        token,
        stdoutEndPoint,
      );
      const respJson = await epResponse.json();
      const stdError = respJson.results.find(
        (item: any) => item.event_data?.res?.msg,
      )?.event_data?.res?.msg;
      this.logger.error(`[${this.pluginLogName}] Error: ${stdError}`);
      throw new Error(`Failed to create project`);
    }
    this.logger.info(`The project is ready.`);
    projectData.url = `${this.getBaseUrl()}/execution/projects/${projectData.id}/details`;
    return projectData;
  }

  public async deleteExecutionEnvironmentExists(
    name: string,
    token: string,
  ): Promise<void> {
    this.logger.info(
      `Check if execution environment with name ${name} exist in organization.`,
    );
    const endPoint = `api/controller/v2/execution_environments/?name=${name}`;
    const environments = await this.executeGetRequest(endPoint, token);
    const environmentsList = await environments.json();
    if (environmentsList.results.length === 1) {
      this.logger.info(
        `Delete execution environment with id: ${environmentsList.results[0].id}.`,
      );
      await this.deleteExecutionEnvironment(
        environmentsList.results[0].id,
        token,
      );
      this.logger.info(
        `End delete execution environment with id: ${environmentsList.results[0].id}.`,
      );
    }
  }

  public async createExecutionEnvironment(
    payload: ExecutionEnvironment,
    token: string,
    deleteIfExist?: boolean,
  ): Promise<ExecutionEnvironment> {
    if (deleteIfExist) {
      await this.deleteExecutionEnvironmentExists(
        payload.environmentName,
        token,
      );
    }
    const endPoint = 'api/controller/v2/execution_environments/';
    const data = {
      name: payload.environmentName,
      description: payload?.environmentDescription ?? '',
      organization: payload.organization.id,
      image: payload.image,
      pull: payload.pull,
    };
    this.logger.info(
      `[${this.pluginLogName}] Scaffolder creating new AAP execution environment at ${this.ansibleConfig.rhaap?.baseUrl}.`,
    );
    this.logger.info(
      `Begin creating execution environment ${payload.environmentName}.`,
    );
    const response = await this.executePostRequest(endPoint, token, data);
    this.logger.info(
      `End creating execution environment ${payload.environmentName}.`,
    );
    const eeData = (await response.json()) as ExecutionEnvironment;
    eeData.url = `${this.getBaseUrl()}/execution/infrastructure/execution-environments/${eeData.id}/details`;
    return eeData;
  }

  public async deleteExecutionEnvironment(
    environmentID: number,
    token: string,
  ): Promise<any> {
    const endPoint = `api/controller/v2/execution_environments/${environmentID}/`;
    return await this.executeDeleteRequest(endPoint, token);
  }

  public async deleteJobTemplate(
    templateID: number,
    token: string,
  ): Promise<any> {
    const endPoint = `api/controller/v2/job_templates/${templateID}/`;
    return await this.executeDeleteRequest(endPoint, token);
  }

  public async deleteJobTemplateIfExists(
    name: string,
    organization: Organization,
    token: string,
  ): Promise<void> {
    const endPoint = `api/controller/v2/job_templates/?organization=${organization.id}&name=${name}`;
    this.logger.info(
      `Check if job template with name ${name} exist in organization.`,
    );
    const templates = await this.executeGetRequest(endPoint, token);
    const templatesList = await templates.json();
    if (templatesList.results.length === 1) {
      this.logger.info(
        `Delete job template with id: ${templatesList.results[0].id}.`,
      );
      await this.deleteJobTemplate(templatesList.results[0].id, token);
      this.logger.info(
        `End delete job template with id: ${templatesList.results[0].id}.`,
      );
    }
  }

  private async updateUseCaseUrls(
    extraVariables: any,
    git_username: string | undefined,
    git_password: string | undefined,
  ) {
    return {
      ...extraVariables,
      usecases: extraVariables.usecases.map((usecase: any) => ({
        ...usecase,
        url: usecase.url.replace(
          'https://',
          `https://${git_username}:${git_password}@`,
        ),
      })),
    };
  }

  public async createJobTemplate(
    payload: JobTemplate,
    deleteIfExist: boolean,
    token: string,
  ): Promise<JobTemplate> {
    if (deleteIfExist) {
      await this.deleteJobTemplateIfExists(
        payload.templateName,
        payload.organization,
        token,
      );
    }
    const endPoint = 'api/controller/v2/job_templates/';
    let extraVariables;
    extraVariables = payload?.extraVariables
      ? JSON.parse(JSON.stringify(payload.extraVariables))
      : '';
    if (extraVariables !== '') {
      extraVariables.aap_validate_certs = this.ansibleConfig.rhaap?.checkSSL;
      extraVariables.aap_hostname = this.ansibleConfig.rhaap?.baseUrl;
      if (payload.credentials && payload.credentials?.kind === 'scm') {
        let git_password;
        if (payload.scmType === 'Github') {
          git_password = this.ansibleConfig.githubIntegration?.token;
        } else if (payload.scmType === 'Gitlab') {
          git_password = this.ansibleConfig.gitlabIntegration?.token;
        }
        extraVariables = await this.updateUseCaseUrls(
          extraVariables,
          payload.credentials?.inputs?.username,
          git_password,
        );
      }
    }
    const data = {
      name: payload.templateName,
      description: payload?.templateDescription ?? '',
      job_type: 'run',
      inventory: payload.jobInventory.id,
      project: payload.project.id,
      playbook: payload.playbook,
      execution_environment: payload?.executionEnvironment?.id ?? '',
      extra_vars: extraVariables ? YAML.stringify(extraVariables) : '',
    };
    this.logger.info(`Begin creating job template ${payload.templateName}.`);
    const response = await this.executePostRequest(endPoint, token, data);
    const jobTemplate = (await response.json()) as JobTemplate;
    this.logger.info(`End creating job template ${payload.templateName}.`);
    jobTemplate.url = `${this.getBaseUrl()}/execution/templates/job-template/${jobTemplate.id}/details`;
    return jobTemplate;
  }

  public async fetchEvents(
    jobID: number,
    token: string,
    results?: never[],
    fullUrl?: string,
  ): Promise<any> {
    let result = results ? results : [];
    const eventsResponse = await this.executeGetRequest(
      `api/controller/v2/jobs/${jobID}/job_events/`,
      token,
      fullUrl,
    );
    const response = await eventsResponse.json();
    result = [...result, ...response.results] as never[];
    if (response.next) {
      return await this.fetchEvents(jobID, token, result, response.next);
    }
    return result;
  }

  public async fetchResult(jobID: number, token: string) {
    let shouldWait = true;
    const endPoint = `api/controller/v2/jobs/${jobID}/`;
    let jobDetailResponseData;
    while (shouldWait) {
      await this.sleep(2000);
      const jobDetailResponse = await this.executeGetRequest(endPoint, token);
      jobDetailResponseData = await jobDetailResponse.json();
      const status = jobDetailResponseData.status;
      if (
        ['successful', 'failed', 'error', 'canceled'].includes(
          status.toString().toLowerCase(),
        )
      ) {
        shouldWait = false;
        break;
      }
    }
    return {
      jobEvents: await this.fetchEvents(jobID, token),
      jobData: jobDetailResponseData,
    };
  }

  public async launchJobTemplate(
    payload: Omit<LaunchJobTemplate, 'token'>,
    token: string,
  ): Promise<any> {
    const data = { extra_vars: payload?.extraVariables ?? '' } as {
      inventory?: number;
      job_type?: string;
      executionEnvironment?: number;
      execution_environment?: number;
      forks?: number;
      limit?: string;
      verbosity?: number;
      job_slice_count?: number;
      timeout?: number;
      diff_mode?: boolean;
      job_tags?: string;
      skip_tags?: string;
      extra_vars?: object | string;
      credentials?: number[];
    };
    if (payload?.inventory?.id) {
      data.inventory = payload.inventory.id;
    }
    if (payload?.jobType) {
      data.job_type = payload.jobType;
    }
    if (payload?.executionEnvironment?.id) {
      data.execution_environment = payload.executionEnvironment.id;
    }
    if (payload?.forks || payload.forks === 0) {
      data.forks = payload.forks;
    }
    if (payload?.limit) {
      data.limit = payload.limit;
    }
    if (payload?.verbosity?.id !== undefined) {
      data.verbosity = payload.verbosity.id;
    }
    if (payload?.jobSliceCount || payload.jobSliceCount === 0) {
      data.job_slice_count = payload.jobSliceCount;
    }
    if (payload?.timeout || payload.timeout === 0) {
      data.timeout = payload.timeout;
    }
    if (payload?.diffMode || payload.diffMode === false) {
      data.diff_mode = payload.diffMode;
    }
    if (payload?.jobTags) {
      data.job_tags = payload.jobTags;
    }
    if (payload?.skipTags) {
      data.skip_tags = payload.skipTags;
    }

    if (payload?.credentials?.length) {
      const seen = new Set();
      const duplicates: string[] = [];
      payload.credentials.some(currentObject => {
        if (!currentObject.credential_type) {
          return false;
        }
        if (seen.size === seen.add(currentObject.credential_type).size) {
          const credentialTypeName =
            currentObject.summary_fields?.credential_type?.name ||
            currentObject.name ||
            'Unknown';
          duplicates.push(credentialTypeName);
          return true;
        }
        return false;
      });
      if (duplicates.length) {
        this.logger.error(
          `Cannot assign multiple credentials of the same type. Duplicated credential types are: ${duplicates.join(', ')}`,
        );
        throw new Error(
          `Cannot assign multiple credentials of the same type. Duplicated credential types are: ${duplicates.join(
            ', ',
          )}`,
        );
      }
      data.credentials = payload.credentials
        .filter(c => c.id !== undefined && c.id !== null)
        .map(c => c.id);
    }

    let templateID;
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('name', payload.template);
    const templateIdEndpoint = `api/controller/v2/job_templates/?${decodeURIComponent(urlSearchParams.toString())}`;
    try {
      const templateResponse = await this.executeGetRequest(
        templateIdEndpoint,
        token,
      );
      const templateJsonResp = await templateResponse.json();

      if (!templateJsonResp.results || templateJsonResp.results.length === 0) {
        this.logger.error(
          `No job template found with name: ${payload.template}. Please check the template name and access.`,
        );
        throw new Error(`No job template found with name: ${payload.template}`);
      }
      templateID = templateJsonResp.results[0].id;
    } catch (e) {
      this.logger.error(
        `Failed to fetch job template ${payload.template}. Please make sure that the template name is correct and template is available on AAP. ${e}`,
      );
      throw e;
    }

    const endPoint = `api/controller/v2/job_templates/${templateID}/launch/`;

    this.logger.info(`Start executing job template.`);
    const response = await this.executePostRequest(endPoint, token, data);
    const jobResponseJson = await response.json();
    const jobID = jobResponseJson.job;
    this.logger.info(`Waiting for result of the executed job template.`);

    let lastEvent;
    let result;
    try {
      result = await this.fetchResult(jobID, token);
      const stdoutEndPoint = `api/controller/v2/jobs/${jobID}/stdout/?format=txt`;
      const stdoutResponse = await this.executeGetRequest(
        stdoutEndPoint,
        token,
      );
      const stdoutRespText = await stdoutResponse.text();
      const messageRegex = /"msg":\s*"([^"]+)"|"msg":\s*\[(.*?)\]/gs;
      const matchRegex = [...stdoutRespText.matchAll(messageRegex)];
      matchRegex.forEach(macthingMsg => {
        if (macthingMsg[1]) {
          this.logger.info(macthingMsg[1]);
        } else if (macthingMsg[2]) {
          const arrayItems = [...macthingMsg[2].matchAll(/"([^"]+)"/g)];
          arrayItems.forEach(arrayItem => this.logger.info(arrayItem[1]));
        }
      });
      if (result.jobData.status !== 'successful') {
        lastEvent = matchRegex[matchRegex.length - 1][1];
        this.logger.error(`Job failed: ${lastEvent}`);
        throw new Error(`Job execution failed due to ${lastEvent}`);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Job execution failed due to')
      ) {
        throw error;
      }
      lastEvent =
        'Undefined Error. Please check the RHAAP portal for job execution logs.';
      this.logger.error(`${error}`);
      this.logger.error(`Error while executing job template.`);
      this.logger.error(`Job failed: ${lastEvent}`);
      throw new Error(`Job execution failed due to ${lastEvent}`);
    }

    return {
      id: jobID,
      status: result.jobData.status,
      events: result.jobEvents,
      url: `${this.getBaseUrl()}/execution/jobs/playbook/${jobID}/output`,
    };
  }

  public async cleanUp(payload: CleanUp, token: string): Promise<void> {
    if (payload?.project?.id) {
      this.logger.info(`Delete project with id ${payload.project.id}.`);
      await this.deleteProject(payload.project.id, token);
    }
    if (payload?.template?.id) {
      this.logger.info(`Delete template with id ${payload.template.id}.`);
      await this.deleteJobTemplate(payload.template.id, token);
    }
    if (payload?.executionEnvironment?.id) {
      this.logger.info(
        `Delete execution environment with id ${payload.executionEnvironment.id}.`,
      );
      await this.deleteExecutionEnvironment(
        payload.executionEnvironment.id,
        token,
      );
    }
  }

  public async getResourceData(resource: string, token: string): Promise<any> {
    let aapResource = resource;
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('order_by', 'name');
    urlSearchParams.set('page_size', '200');
    if (resource.includes('execution_environments')) {
      const [url, orgId] = resource.split(':');
      aapResource = url;
      if (orgId) {
        urlSearchParams.set('or__organization__id', orgId);
        urlSearchParams.set('or__organization__isnull', 'True');
      }
    }
    if (resource.includes('job_templates')) {
      if (this.catalogConfig.organizations.length === 1) {
        urlSearchParams.set(
          'organization__name__iexact',
          this.catalogConfig.organizations.toString(),
        );
      }
      // Adds support for multiple orgs with OR operator
      else if (this.catalogConfig.organizations.length > 1) {
        this.catalogConfig.organizations.forEach(orgName => {
          urlSearchParams.append('or__organization__name__iexact', orgName);
        });
      }
      if (this.catalogConfig.surveyEnabled !== undefined) {
        urlSearchParams.set(
          'survey_enabled',
          this.catalogConfig.surveyEnabled.toString(),
        );
      }

      if (this.catalogConfig.jobTemplateLabels.length > 0) {
        urlSearchParams.set(
          'labels__name__in',
          this.catalogConfig.jobTemplateLabels.join(','),
        );
      }

      if (this.catalogConfig.jobTemplateExcludeLabels.length > 0) {
        urlSearchParams.set(
          'not__labels__name__in',
          this.catalogConfig.jobTemplateExcludeLabels.join(','),
        );
      }
    }

    const endPoint = `api/controller/v2/${aapResource}/?${decodeURIComponent(urlSearchParams.toString())}`;
    const response = await this.executeGetRequest(endPoint, token);
    return await response.json();
  }

  public async getJobTemplatesByName(
    templateNames: string[],
    organization: Organization,
    token: string | null,
  ): Promise<AAPTemplate[]> {
    const endPoint = `api/controller/v2/job_templates/?organization=${organization.id}&name__in=${templateNames}`;
    const response = await this.executeGetRequest(endPoint, token);
    const list = await response.json();
    const results = list.results;
    if (!results?.length) {
      throw new Error(`No job templates found.`);
    }
    return results.map(
      (result: { id: number; name: string }): { id: number; name: string } => {
        return { id: result.id, name: result.name };
      },
    );
  }

  /**
   * Authenticates with Red Hat Ansible Automation Platform (RH AAP) using either an authorization code
   * or a refresh token, and retrieves OAuth tokens.
   *
   * @param options - The authentication options.
   * @param options.host - The RH AAP host URL.
   * @param options.checkSSL - Whether to verify SSL certificates.
   * @param options.clientId - The OAuth client ID.
   * @param options.clientSecret - The OAuth client secret.
   * @param options.callbackURL - The OAuth redirect URI.
   * @param options.code - The authorization code (optional, required for initial authentication).
   * @param options.refreshToken - The refresh token (optional, required for token refresh).
   * @returns An object containing the OAuth session, including access token, token type, scope, expiration, and refresh token.
   * @throws {AuthenticationError} If neither code nor refreshToken is provided, or if authentication fails.
   */
  public async rhAAPAuthenticate(options: {
    host: string;
    checkSSL: boolean;
    clientId: string;
    clientSecret: string;
    callbackURL: string;
    code?: string;
    refreshToken?: string;
  }): Promise<OAuthAuthenticatorResult<PassportProfile>> {
    const endPoint = 'o/token/';
    const data = new URLSearchParams();
    if (options.code) {
      data.append('grant_type', 'authorization_code');
      data.append('code', options.code);
    } else if (options.refreshToken) {
      data.append('grant_type', 'refresh_token');
      data.append('refresh_token', options.refreshToken);
    } else {
      throw new AuthenticationError('You have to provide code or refreshToken');
    }
    data.append('client_id', options.clientId);
    data.append('client_secret', options.clientSecret);
    data.append('redirect_uri', options.callbackURL);
    this.logger.info(
      `[${this.pluginLogName}]: Authenticating with RH AAP at ${this.ansibleConfig.rhaap?.baseUrl}/${endPoint}.`,
    );
    const response = await this.executePostRequest(
      endPoint,
      undefined,
      data,
      true,
    );

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to obtain access token from RH AAP.',
      );
    }

    const jsonResponse = (await response.json()) as TokenResponse;

    return {
      session: {
        accessToken: jsonResponse.access_token,
        tokenType: jsonResponse.token_type,
        scope: jsonResponse.scope,
        expiresInSeconds: jsonResponse.expires_in,
        refreshToken: jsonResponse.refresh_token,
      },
    } as OAuthAuthenticatorResult<PassportProfile>;
  }

  /**
   * Revokes an OAuth token from the Red Hat Ansible Automation Platform (RH AAP).
   *
   * @param options - The revocation options.
   * @param options.clientId - The OAuth client ID.
   * @param options.clientSecret - The OAuth client secret.
   * @param options.token - The token to revoke (access or refresh token).
   */
  public async rhAAPRevokeToken(options: {
    clientId: string;
    clientSecret: string;
    token: string;
  }): Promise<void> {
    const endPoint = 'o/revoke_token/';
    const data = new URLSearchParams();
    data.append('token', options.token);
    data.append('client_id', options.clientId);
    data.append('client_secret', options.clientSecret);

    this.logger.info(
      `[${this.pluginLogName}]: Revoking token from RH AAP at ${this.ansibleConfig.rhaap?.baseUrl}/${endPoint}.`,
    );

    const response = await this.executePostRequest(
      endPoint,
      undefined,
      data,
      true,
    );

    if (!response.ok) {
      this.logger.warn(
        `[${this.pluginLogName}]: Failed to revoke AAP token: ${response.status}`,
      );
    }
  }

  /**
   * Fetches the user profile data from the Red Hat Ansible Automation Platform (RH AAP)
   * using the provided authentication token.
   *
   * @param token - The OAuth2 access token used for authenticating the request.
   * @returns A promise that resolves to a {@link PassportProfile} object containing the user's
   *          provider, username, email, and display name.
   * @throws {AuthenticationError} If the profile data cannot be retrieved or is in an unexpected format.
   */
  public async fetchProfile(token: string): Promise<PassportProfile> {
    this.logger.info(
      `[${this.pluginLogName}]: Fetching profile data from RH AAP.`,
    );
    let response;
    try {
      const endPoint = 'api/gateway/v1/me/';
      response = await this.executeGetRequest(endPoint, token);
    } catch (e) {
      throw new AuthenticationError(
        'Failed to retrieve profile data from RH AAP.',
      );
    }
    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to retrieve profile data from RH AAP.',
      );
    }
    const userDataJson = (await response.json()) as {
      results: {
        id: number;
        username: string;
        email: string;
        first_name: string;
        last_name: string;
      }[];
    };
    let userData;
    if (
      Object.hasOwn(userDataJson, 'results') &&
      Array.isArray(userDataJson.results) &&
      userDataJson.results?.length
    ) {
      userData = userDataJson.results[0];
    } else {
      throw new AuthenticationError(
        `Profile data from RH AAP is in an unexpected format. Please contact your system administrator`,
      );
    }
    return {
      provider: 'AAP oauth2',
      id: userData.id ? userData.id.toString() : '',
      username: userData.username,
      email: userData.email,
      displayName: `${userData?.first_name ? userData.first_name : ''} ${userData?.last_name ? userData.last_name : ''}`,
    } as PassportProfile;
  }

  private formatNameSpace(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s/g, '-');
  }

  private async executeCatalogRequest(
    endPoint: string,
    token: string | null,
    results?: never[],
  ): Promise<never[]> {
    let result = results ?? [];
    const response = await this.executeGetRequest(endPoint, token);
    const jsonResponse = (await response.json()) as PaginatedResponse;
    result = [...result, ...jsonResponse.results];
    if (jsonResponse.next) {
      return await this.executeCatalogRequest(jsonResponse.next, token, result);
    }
    return result;
  }

  public async getOrganizations(userAndTeamDetails?: boolean): Promise<
    Array<{
      organization: Organization;
      teams: Team[];
      users: User[];
    }>
  > {
    const orgEndPoint = 'api/gateway/v1/organizations/';
    try {
      const token = this.ansibleConfig.rhaap?.token ?? null;
      let urlSearchParams = new URLSearchParams();
      urlSearchParams.set('page_size', '200');
      if (this.catalogConfig.organizations.length === 1) {
        urlSearchParams.set(
          'name__iexact',
          this.catalogConfig.organizations.toString(),
        );
      }
      // Adds support for multiple orgs with OR operator
      else if (this.catalogConfig.organizations.length > 1) {
        this.catalogConfig.organizations.forEach(orgName => {
          urlSearchParams.append('or__name__iexact', orgName);
        });
      }
      const rawOrgs = await this.executeCatalogRequest(
        `${orgEndPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
        token,
      );

      if (!userAndTeamDetails) {
        return rawOrgs.map((org: any) => {
          return {
            organization: org,
            teams: [],
            users: [],
          };
        });
      }

      const orgData = await Promise.all(
        rawOrgs.map(async (org: any) => {
          const usersUrl: string | undefined = org.related?.users;
          const teamsUrl: string = org.related.teams;
          urlSearchParams = new URLSearchParams();
          urlSearchParams.set('page_size', '200');

          const [rawTeams, users] = await Promise.all([
            teamsUrl
              ? this.executeCatalogRequest(
                  `${teamsUrl}?${decodeURIComponent(urlSearchParams.toString())}`,
                  token,
                )
              : [],
            (usersUrl
              ? this.executeCatalogRequest(
                  `${usersUrl}?${decodeURIComponent(urlSearchParams.toString())}`,
                  token,
                )
              : []) as Users,
          ]);

          // Process team users in smaller batches to avoid API overload
          const batchSize = 100;
          for (let i = 0; i < rawTeams.length; i += batchSize) {
            const batch = rawTeams.slice(i, i + batchSize);
            const batchUrlSearchParams = new URLSearchParams();
            batchUrlSearchParams.set('page_size', '200');
            const batchPromises = batch.map(async (team: any) => {
              let teamUsersUrl: string | undefined = team.related?.users;
              if (!teamUsersUrl) {
                return [];
              }
              teamUsersUrl = `${teamUsersUrl}?${decodeURIComponent(batchUrlSearchParams.toString())}`;
              const teamUsers = ((await this.executeCatalogRequest(
                teamUsersUrl,
                token,
              )) ?? []) as Users;
              return teamUsers.map((user: User) => {
                if (!users.some(orgUser => orgUser.id === user.id)) {
                  user.is_orguser = false;
                }
                return user;
              });
            });
            const batchResults = await Promise.all(batchPromises);
            const teamUsers = batchResults.flat();
            users.push(...teamUsers);
          }

          const teams: Team[] = (rawTeams || []).map((item: Team) => ({
            id: item.id,
            organization: item.organization,
            name: item.name,
            groupName: item.name.toLowerCase().replace(/\s/g, '-'),
            description: item?.description,
          }));

          return {
            organization: {
              id: org.id,
              name: org.name,
              namespace:
                org.namespace ?? org.name.toLowerCase().replace(/\s/g, '-'),
            },
            teams,
            users: uniqBy(users, 'id'),
          };
        }),
      );

      return orgData;
    } catch (err) {
      this.logger.error(
        `Error retrieving organization details from ${orgEndPoint}.`,
      );
      throw new Error(
        `Error retrieving organization details from ${orgEndPoint} : ${err}.`,
      );
    }
  }

  public async listSystemUsers(): Promise<Users> {
    const endPoint = 'api/gateway/v1/users/?is_superuser=true';
    const token = this.ansibleConfig.rhaap?.token ?? null;
    this.logger.info(`Fetching users from RH AAP.`);
    const users = (await this.executeCatalogRequest(endPoint, token)) as Users;
    return users;
  }

  public async getTeamsByUserId(userID: number): Promise<
    {
      name: string;
      groupName: string;
      id: number;
      orgId: number;
      orgName: string;
    }[]
  > {
    const endPoint = `api/gateway/v1/users/${userID}/teams/`;
    const token = this.ansibleConfig.rhaap?.token ?? null;
    this.logger.info(`Fetching teams for user ID: ${userID} from RH AAP.`);
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('page_size', '200');
    const teams = await this.executeCatalogRequest(
      `${endPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
      token,
    );
    return teams
      .filter((team: any) => team?.name)
      .map((team: any) => ({
        name: team.name,
        groupName: this.formatNameSpace(team.name),
        id: team.id,
        orgId: team.organization,
        orgName: team.summary_fields.organization.name,
      }));
  }

  public async getOrgsByUserId(
    userID: number,
  ): Promise<{ name: string; groupName: string }[]> {
    const endPoint = `/api/gateway/v1/users/${userID}/organizations/`;
    const token = this.ansibleConfig.rhaap?.token ?? null;
    this.logger.info(`Fetching orgs for user ID: ${userID} from RH AAP.`);
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('page_size', '200');

    // Fetch details of orgs that are configured in app-config.
    if (this.catalogConfig.organizations.length === 1) {
      urlSearchParams.set(
        'name__iexact',
        this.catalogConfig.organizations.toString(),
      );
    }
    // Adds support for multiple orgs with OR operator
    else if (this.catalogConfig.organizations.length > 1) {
      this.catalogConfig.organizations.forEach(orgName => {
        urlSearchParams.append('or__name__iexact', orgName);
      });
    }
    const orgs = await this.executeCatalogRequest(
      `${endPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
      token,
    );
    return orgs
      .filter((org: any) => org?.name)
      .map((org: any) => ({
        name: org.name,
        groupName: this.formatNameSpace(org.name),
      }));
  }

  public async getUserInfoById(userID: number): Promise<User> {
    const endPoint = `/api/gateway/v1/users/${userID}/`;
    const token = this.ansibleConfig.rhaap?.token ?? null;
    this.logger.info(`Fetching user details for ID: ${userID} from RH AAP.`);
    const userResponse: any = await this.executeGetRequest(endPoint, token);
    const userJson = await userResponse.json();
    this.logger.info(`User information ${JSON.stringify(userJson)}`);

    return {
      id: userJson.id,
      url: userJson.url,
      username: userJson.username,
      email: userJson.email || '',
      first_name: userJson.first_name || '',
      last_name: userJson.last_name || '',
      is_superuser: userJson.is_superuser || false,
      is_orguser: true,
    };
  }

  public async getUserRoleAssignments(): Promise<RoleAssignments> {
    const endPoint = 'api/gateway/v1/role_user_assignments/';
    const token = this.ansibleConfig.rhaap?.token ?? null;
    this.logger.info(`Fetching role assignments from RH AAP.`);
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('page_size', '200');
    const roles = await this.executeCatalogRequest(
      `${endPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
      token,
    );
    return roles.reduce(
      (map: RoleAssignments, item: RoleAssignmentResponse) => {
        const tmp = map?.[item.user] ? map[item.user] : {};
        if (item?.summary_fields?.role_definition?.name) {
          const roleDef = tmp?.[item.summary_fields.role_definition.name]
            ? tmp[item.summary_fields.role_definition.name]
            : [];
          if (item?.object_id) {
            roleDef.push(item.object_id);
          }
          tmp[item.summary_fields.role_definition.name] = roleDef;
        }
        map[item.user] = tmp;
        return map;
      },
      {},
    ) as RoleAssignments;
  }

  async syncJobTemplates(
    surveyEnabled: boolean | undefined,
    jobTemplateLabels: string[],
    jobTemplateExcludeLabels: string[] = [],
  ): Promise<
    {
      job: IJobTemplate;
      survey: ISurvey | null;
      instanceGroup: InstanceGroup[];
    }[]
  > {
    const endPoint = '/api/controller/v2/job_templates';
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('page_size', '100');
    if (this.catalogConfig.organizations.length === 1) {
      urlSearchParams.set(
        'organization__name__iexact',
        this.catalogConfig.organizations.toString(),
      );
    }
    // Adds support for multiple orgs with OR operator
    else if (this.catalogConfig.organizations.length > 1) {
      this.catalogConfig.organizations.forEach(orgName => {
        urlSearchParams.append(`or__organization__name__iexact`, orgName);
      });
    }

    if (surveyEnabled !== undefined) {
      urlSearchParams.set('survey_enabled', surveyEnabled.toString());
    }

    if (jobTemplateLabels.length > 0) {
      urlSearchParams.set('labels__name__in', jobTemplateLabels.join(','));
    }

    if (jobTemplateExcludeLabels.length > 0) {
      urlSearchParams.set(
        'not__labels__name__in',
        jobTemplateExcludeLabels.join(','),
      );
    }

    this.logger.info(`Fetching job templates from RH AAP.`);
    try {
      const token = this.ansibleConfig.rhaap?.token ?? null;
      const templates = await this.executeCatalogRequest(
        `${endPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
        token,
      );
      const jobTemplatesData = await Promise.all(
        templates.map(async (template: IJobTemplate) => {
          let survey = null;
          let instanceGroup: InstanceGroup[] = [];
          if (template.survey_enabled) {
            const response = await this.executeGetRequest(
              template.related?.survey_spec,
              token,
            );
            survey = (await response.json()) as ISurvey;
          }

          if (template.related?.instance_groups) {
            const instanceGroupResults = (await this.executeCatalogRequest(
              template.related?.instance_groups,
              token,
            )) as InstanceGroup[];
            instanceGroup = instanceGroupResults;
          }

          return {
            job: template,
            survey,
            instanceGroup,
          };
        }),
      );

      return jobTemplatesData;
    } catch (err) {
      this.logger.error(
        `Error retrieving job templates from ${endPoint}. ${JSON.stringify(err)}`,
      );
      throw new Error(`Error retrieving job templates from ${endPoint}.`);
    }
  }

  /**
   * Lists workflow job templates for the catalog, with optional survey specs.
   * Same org / label filters as {@link syncJobTemplates}.
   */
  async syncWorkflowJobTemplates(
    surveyEnabled: boolean | undefined,
    labels: string[],
    excludeLabels: string[] = [],
  ): Promise<
    {
      workflow: IWorkflowJobTemplate;
      survey: ISurvey | null;
    }[]
  > {
    const endPoint = '/api/controller/v2/workflow_job_templates';
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('page_size', '100');
    if (this.catalogConfig.organizations.length === 1) {
      urlSearchParams.set(
        'organization__name__iexact',
        this.catalogConfig.organizations.toString(),
      );
    } else if (this.catalogConfig.organizations.length > 1) {
      this.catalogConfig.organizations.forEach(orgName => {
        urlSearchParams.append(`or__organization__name__iexact`, orgName);
      });
    }

    if (surveyEnabled !== undefined) {
      urlSearchParams.set('survey_enabled', surveyEnabled.toString());
    }

    if (labels.length > 0) {
      urlSearchParams.set('labels__name__in', labels.join(','));
    }

    if (excludeLabels.length > 0) {
      urlSearchParams.set('not__labels__name__in', excludeLabels.join(','));
    }

    this.logger.info(`Fetching workflow job templates from RH AAP.`);
    try {
      const token = this.ansibleConfig.rhaap?.token ?? null;
      const templates = (await this.executeCatalogRequest(
        `${endPoint}?${decodeURIComponent(urlSearchParams.toString())}`,
        token,
      )) as IWorkflowJobTemplate[];

      const results = await Promise.all(
        templates.map(async (template: IWorkflowJobTemplate) => {
          let survey: ISurvey | null = null;
          if (template.survey_enabled && template.related?.survey_spec) {
            const response = await this.executeGetRequest(
              template.related.survey_spec,
              token,
            );
            survey = (await response.json()) as ISurvey;
          }
          return { workflow: template, survey };
        }),
      );

      return results;
    } catch (err) {
      this.logger.error(
        `Error retrieving workflow job templates from ${endPoint}. ${JSON.stringify(err)}`,
      );
      throw new Error(
        `Error retrieving workflow job templates from ${endPoint}.`,
      );
    }
  }

  /**
   * Polls `/workflow_jobs/{id}/` until terminal status or timeout.
   */
  private async waitForWorkflowJobTerminalState(
    workflowJobId: number,
    token: string,
    options: { maxWaitMs: number; pollIntervalMs: number },
  ): Promise<{ status: string; detail: Record<string, unknown> }> {
    const endpoint = `api/controller/v2/workflow_jobs/${workflowJobId}/`;
    const deadline = Date.now() + options.maxWaitMs;
    let lastDetail: Record<string, unknown> = {};
    let lastStatus = '';
    let previousLogged = '';

    const isTerminal = (s: string) =>
      ['successful', 'failed', 'error', 'canceled'].includes(s.toLowerCase());

    while (Date.now() < deadline) {
      const resp = await this.executeGetRequest(endpoint, token);
      lastDetail = (await resp.json()) as Record<string, unknown>;
      lastStatus = String(lastDetail.status ?? '').trim();
      if (lastStatus !== previousLogged) {
        this.logger.info(
          `Workflow job ${workflowJobId} status: ${lastStatus || '(pending)'}`,
        );
        previousLogged = lastStatus;
      }
      if (lastStatus && isTerminal(lastStatus)) {
        return { status: lastStatus, detail: lastDetail };
      }
      await this.sleep(options.pollIntervalMs);
    }

    const inspectUrl = `${this.getBaseUrl()}/execution/workflows/${workflowJobId}/output`;
    throw new Error(
      `Workflow job ${workflowJobId} did not reach a terminal state within ${Math.round(
        options.maxWaitMs / 1000,
      )}s. Last status: "${lastStatus}". Inspect: ${inspectUrl}`,
    );
  }

  /**
   * Launches a workflow job template by name, then optionally waits for a terminal workflow job status.
   * {@link onLaunched} runs immediately after Controller returns a workflow job id (before polling), so callers can log/stream the id while the workflow still runs.
   */
  public async launchWorkflowJobTemplate(
    payload: LaunchWorkflowJobTemplate,
    token: string,
    onLaunched?: (info: { id: number; url: string }) => void,
  ): Promise<WorkflowJobLaunchResult> {
    const data: Record<string, unknown> = {};
    if (
      payload.extraVariables !== undefined &&
      payload.extraVariables !== '' &&
      payload.extraVariables !== null
    ) {
      data.extra_vars = payload.extraVariables;
    }
    if (payload.inventory?.id) {
      data.inventory = payload.inventory.id;
    }
    if (payload.limit) {
      data.limit = payload.limit;
    }
    if (payload.scmBranch) {
      data.scm_branch = payload.scmBranch;
    }

    const urlSearchParams = new URLSearchParams();
    urlSearchParams.set('name', payload.template);
    const templateIdEndpoint = `api/controller/v2/workflow_job_templates/?${decodeURIComponent(urlSearchParams.toString())}`;
    let templateID: number;
    try {
      const templateResponse = await this.executeGetRequest(
        templateIdEndpoint,
        token,
      );
      const templateJsonResp = await templateResponse.json();

      if (!templateJsonResp.results || templateJsonResp.results.length === 0) {
        this.logger.error(
          `No workflow job template found with name: ${payload.template}. Please check the template name and access.`,
        );
        throw new Error(
          `No workflow job template found with name: ${payload.template}`,
        );
      }
      templateID = templateJsonResp.results[0].id;
    } catch (e) {
      this.logger.error(
        `Failed to fetch workflow job template ${payload.template}. Please make sure that the template name is correct and template is available on AAP. ${e}`,
      );
      throw e;
    }

    const launchEndpoint = `api/controller/v2/workflow_job_templates/${templateID}/launch/`;
    this.logger.info(`Launching workflow job template id ${templateID}.`);
    const response = await this.executePostRequest(launchEndpoint, token, data);
    const jobResponseJson = (await response.json()) as {
      workflow_job?: number;
      id?: number;
    };
    const wfJobId = jobResponseJson.workflow_job ?? jobResponseJson.id;
    if (wfJobId === undefined || wfJobId === null) {
      throw new Error(
        'Workflow launch response did not include a workflow job id.',
      );
    }
    const id = typeof wfJobId === 'number' ? wfJobId : Number(wfJobId);
    const url = `${this.getBaseUrl()}/execution/workflows/${id}/output`;

    onLaunched?.({ id, url });

    /** Omit for default gate on workflow completion (24h cap). Use 0 for launch-only / fire-and-forget. */
    const DEFAULT_MAX_WAIT_SECONDS = 86400;
    const DEFAULT_POLL_SECONDS = 15;
    const MIN_POLL_SECONDS = 5;
    const MAX_POLL_SECONDS = 120;

    let maxWaitRaw =
      payload.maxWaitSeconds === undefined || payload.maxWaitSeconds === null
        ? DEFAULT_MAX_WAIT_SECONDS
        : Number(payload.maxWaitSeconds);

    if (!Number.isFinite(maxWaitRaw)) {
      maxWaitRaw = DEFAULT_MAX_WAIT_SECONDS;
    }

    if (maxWaitRaw <= 0) {
      this.logger.info(
        `Skipping workflow job wait for ${id} (maxWaitSeconds=${maxWaitRaw}).`,
      );
      return { id, url, waitSkipped: true };
    }

    const effectiveMaxSeconds = Math.max(1, Math.floor(maxWaitRaw));

    let pollSeconds =
      payload.pollIntervalSeconds === undefined ||
      payload.pollIntervalSeconds === null
        ? DEFAULT_POLL_SECONDS
        : Number(payload.pollIntervalSeconds);
    if (!Number.isFinite(pollSeconds)) {
      pollSeconds = DEFAULT_POLL_SECONDS;
    }
    pollSeconds = Math.round(pollSeconds);
    pollSeconds = Math.min(
      MAX_POLL_SECONDS,
      Math.max(MIN_POLL_SECONDS, pollSeconds),
    );
    const pollIntervalMs = pollSeconds * 1000;
    const maxWaitMs = effectiveMaxSeconds * 1000;

    const { status } = await this.waitForWorkflowJobTerminalState(id, token, {
      maxWaitMs,
      pollIntervalMs,
    });

    const normalized = status.toLowerCase();
    if (normalized !== 'successful') {
      throw new Error(
        `Workflow job ${id} finished with status "${status}". Open: ${url}`,
      );
    }

    return {
      id,
      url,
      status,
    };
  }

  /**
   * Controller paginates list endpoints with `next` as an absolute URL; normalize to a path + query
   * relative to {@link getBaseUrl} for {@link executeGetRequest}.
   */
  private normalizeControllerPaginationNext(next: string): string {
    try {
      const u = new URL(next);
      return `${u.pathname.replace(/^\//, '')}${u.search}`;
    } catch {
      return next.replace(/^\//, '');
    }
  }

  /** Single workflow job record (`GET …/workflow_jobs/{id}/`). */
  public async getWorkflowJobDetail(
    workflowJobId: number,
    token: string,
  ): Promise<Record<string, unknown>> {
    const resp = await this.executeGetRequest(
      `api/controller/v2/workflow_jobs/${workflowJobId}/`,
      token,
    );
    return (await resp.json()) as Record<string, unknown>;
  }

  /** All workflow job nodes for a run (`GET …/workflow_jobs/{id}/workflow_nodes/`), paginated. */
  public async listWorkflowJobNodes(
    workflowJobId: number,
    token: string,
  ): Promise<Record<string, unknown>[]> {
    const pageSize = 100;
    const initialPath = `api/controller/v2/workflow_jobs/${workflowJobId}/workflow_nodes/?page_size=${pageSize}`;
    const acc: Record<string, unknown>[] = [];
    let nextPath: string | null = initialPath;

    while (nextPath) {
      const resp = await this.executeGetRequest(nextPath, token);
      const json = (await resp.json()) as {
        results?: Record<string, unknown>[];
        next?: string | null;
      };
      if (json.results?.length) {
        acc.push(...json.results);
      }
      nextPath = json.next
        ? this.normalizeControllerPaginationNext(json.next)
        : null;
    }

    return acc;
  }

  /**
   * Workflow job **template** graph (`GET …/workflow_job_templates/{id}/workflow_nodes/`),
   * paginated — available before/alongside runtime run nodes for early UI skeleton.
   */
  public async listWorkflowJobTemplateNodes(
    workflowJobTemplateId: number,
    token: string,
  ): Promise<Record<string, unknown>[]> {
    const pageSize = 100;
    const initialPath = `api/controller/v2/workflow_job_templates/${workflowJobTemplateId}/workflow_nodes/?page_size=${pageSize}`;
    const acc: Record<string, unknown>[] = [];
    let nextPath: string | null = initialPath;

    while (nextPath) {
      const resp = await this.executeGetRequest(nextPath, token);
      const json = (await resp.json()) as {
        results?: Record<string, unknown>[];
        next?: string | null;
      };
      if (json.results?.length) {
        acc.push(...json.results);
      }
      nextPath = json.next
        ? this.normalizeControllerPaginationNext(json.next)
        : null;
    }

    return acc;
  }

  /** Plain-text stdout for a playbook job spawned under a workflow node. */
  public async getJobStdoutText(jobId: number, token: string): Promise<string> {
    const resp = await this.executeGetRequest(
      `api/controller/v2/jobs/${jobId}/stdout/?format=txt`,
      token,
    );
    return await resp.text();
  }

  public async isValidPAHRepository(repositoryName: string): Promise<boolean> {
    const endPoint = `api/galaxy/pulp/api/v3/repositories?name=${encodeURIComponent(repositoryName)}`;
    const token = this.ansibleConfig.rhaap?.token ?? null;
    const response = await this.executeGetRequest(endPoint, token);
    const data = await response.json();
    if (data.results.length > 0) {
      return true;
    }
    return false;
  }

  public async syncCollectionsByRepositories(
    repositories: string[],
    limit: number = 100,
    signal?: AbortSignal,
  ): Promise<Collection[]> {
    const collections: Collection[] = [];
    const token = this.ansibleConfig.rhaap?.token ?? null;

    const context: PAHHelperContext = {
      logger: this.logger,
      pluginLogName: this.pluginLogName,
      executeGetRequest: this.executeGetRequest.bind(this),
      isValidPAHRepository: this.isValidPAHRepository.bind(this),
    };

    if (repositories.length === 0) {
      this.logger.info(
        `[${this.pluginLogName}]: No repositories provided. Returning empty collection list.`,
      );
      return collections;
    }

    const sanitizedLimit = sanitizePAHLimit(limit, context);
    const validationResult = await validateAndFilterRepositories(
      repositories,
      context,
    );

    if (!validationResult) {
      return collections;
    }

    const { validRepos, urlSearchParams } = validationResult;
    urlSearchParams.set('limit', sanitizedLimit.toString());

    let nextUrl: string | null =
      `/api/galaxy/v3/plugin/ansible/search/collection-versions/?${urlSearchParams.toString()}`;

    while (nextUrl) {
      if (signal?.aborted) {
        this.logger.info(
          `[${this.pluginLogName}]: Sync aborted, stopping pagination after ${collections.length} collections`,
        );
        throw new Error(
          `Sync aborted, stopping pagination after ${collections.length} collections`,
        );
      }

      const pageResult = await fetchCollectionsPage(nextUrl, token, context);

      if (!pageResult) {
        break;
      }

      await appendCollectionsFromPage(
        pageResult.collectionsData,
        collections,
        token,
        context,
      );
      nextUrl = extractNextUrl(pageResult.collectionsData);
    }

    this.logger.info(
      `[${this.pluginLogName}]: Successfully retrieved ${collections.length} collections from ${validRepos.length} repositories.`,
    );

    return collections;
  }
}
