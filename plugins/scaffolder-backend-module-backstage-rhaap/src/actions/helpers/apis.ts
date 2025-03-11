import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AAPTemplate,
  CleanUp,
  ExecutionEnvironment,
  JobTemplate,
  LaunchJobTemplate,
  Organization,
  Project,
  AnsibleConfig,
} from '../../types';
import * as YAML from 'yaml';
import { Agent, fetch } from 'undici';

import { Logger } from 'winston';

export class AAPApiClient {
  static pluginLogName = 'plugin-scaffolder-backend-module-backstage-rhaap';
  private readonly logger: LoggerService;
  private readonly winstonLogger: Logger | null;
  private readonly token: string;
  private readonly ansibleConfig: AnsibleConfig;
  private readonly proxyAgent: Agent;

  constructor({
    ansibleConfig,
    logger,
    token,
    winstonLogger,
  }: {
    ansibleConfig: AnsibleConfig;
    logger: LoggerService;
    token: string;
    winstonLogger?: Logger;
  }) {
    this.logger = logger;
    this.winstonLogger = winstonLogger ?? null;
    this.token = token;
    this.ansibleConfig = ansibleConfig;
    this.proxyAgent = new Agent({
      connect: {
        rejectUnauthorized: this.ansibleConfig.checkSSL,
      },
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve, _reject) => {
      setTimeout(resolve, ms);
    });
  }
  private logOutput(level: 'error' | 'warn' | 'info', message: string) {
    if (this.winstonLogger) {
      switch (level) {
        case 'error':
          this.winstonLogger.error(message);
          break;
        case 'warn':
          this.winstonLogger.warn(message);
          break;
        case 'info':
          this.winstonLogger.info(message);
          break;
        default:
          break;
      }
    }
  }
  private async executePostRequest(endPoint: string, data: any): Promise<any> {
    const url = `${this.ansibleConfig.baseUrl}/${endPoint}`;
    this.logger.info(
      `[${AAPApiClient.pluginLogName}] Executing post request to ${url}.`,
    );
    const requestOptions = {
      method: 'POST',
      dispatcher: this.proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(data),
    };
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      this.logger.error(
        `[${AAPApiClient.pluginLogName}] Failed to send POST request to ${url}. ${error}`,
      );
      if (error instanceof Error) {
        throw new Error(`Failed to send POST request: ${error.message}`);
      } else {
        throw new Error(`Failed to send POST request`);
      }
    }
    if (!response.ok) {
      this.logger.error(
        `[${AAPApiClient.pluginLogName}] Failed to send POST request to ${url}. ${response.statusText}`,
      );
      if (response.status === 403) {
        throw new Error(
          'Insufficient privileges. Please contact your administrator.',
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

  private async executeGetRequest(
    endPoint: string,
    fullUrl?: string,
  ): Promise<any> {
    const url = fullUrl
      ? this.ansibleConfig.baseUrl + fullUrl
      : `${this.ansibleConfig.baseUrl}/${endPoint}`;
    const requestOptions = {
      method: 'GET',
      dispatcher: this.proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
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
      this.logger.error(
        `[${AAPApiClient.pluginLogName}] ${response.statusText}`,
      );
      if (response.status === 403) {
        throw new Error(
          'Insufficient privileges. Please contact your administrator.',
        );
      } else {
        throw new Error(`Failed to fetch data`);
      }
    }
    return response;
  }

  private async executeDeleteRequest(endPoint: string): Promise<any> {
    const url = `${this.ansibleConfig.baseUrl}/${endPoint}`;
    this.logger.info(
      `[${AAPApiClient.pluginLogName}]: Executing delete request ${url}.`,
    );
    const requestOptions = {
      method: 'DELETE',
      dispatcher: this.proxyAgent,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    };
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      this.logger.error(
        `[${AAPApiClient.pluginLogName}]: Error while executing delete request ${error}.`,
      );
      if (error instanceof Error) {
        throw new Error(`Failed to send delete: ${error.message}`);
      } else {
        throw new Error(`Failed to send delete`);
      }
    }
    if (!response.ok) {
      this.logger.error(
        `[${AAPApiClient.pluginLogName}]: Error while executing delete request ${response.status}.`,
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

  async getProject(projectID: number): Promise<Project> {
    const endPoint = `api/controller/v2/projects/${projectID}/`;
    const project = await this.executeGetRequest(endPoint);
    return (await project.json()) as Project;
  }

  private async deleteProject(projectID: number) {
    const endPoint = `api/controller/v2/projects/${projectID}/`;
    return await this.executeDeleteRequest(endPoint);
  }

  private async deleteProjectIfExists(
    name: string,
    organization: Organization,
  ): Promise<void> {
    this.logOutput(
      'info',
      `Check if project with name ${name} exist in organization.`,
    );
    const endPoint = `api/controller/v2/projects/?organization=${organization.id}&name=${name}`;
    const projects = await this.executeGetRequest(endPoint);
    const projectList = await projects.json();
    if (projectList.results.length === 1) {
      this.logOutput(
        'info',
        `Delete project with id: ${projectList.results[0].id}.`,
      );
      await this.deleteProject(projectList.results[0].id);
      this.logOutput(
        'info',
        `End delete project with id: ${projectList.results[0].id}.`,
      );
    }
  }

  async createProject(
    payload: Project,
    deleteIfExist: boolean,
  ): Promise<Project> {
    if (deleteIfExist) {
      await this.deleteProjectIfExists(
        payload.projectName,
        payload.organization,
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
      scm_update_on_launch: payload.scmUpdateOnLaunch,
    };
    this.logOutput('info', `Begin creating project ${payload.projectName}.`);
    this.logger.info(
      `[${AAPApiClient.pluginLogName}] Scaffolder creating new AAP project at ${this.ansibleConfig.baseUrl}.`,
    );
    const response = await this.executePostRequest(endPoint, data);
    this.logOutput('info', `End creating project ${payload.projectName}.`);
    let projectData = (await response.json()) as Project;
    const waitStatuses = ['new', 'pending', 'waiting', 'running'];
    let projectStatus = projectData.status as string;
    this.logOutput('info', `Waiting for the project to be ready.`);
    if (waitStatuses.includes(projectStatus)) {
      let dummy = true;
      while (dummy) {
        await this.sleep(100);
        projectData = await this.getProject(projectData.id as number);
        projectStatus = projectData.status as string;
        if (!waitStatuses.includes(projectStatus)) {
          dummy = false;
        }
      }
    }
    if (['failed', 'error', 'canceled'].includes(projectStatus)) {
      this.logger.error(
        `[${AAPApiClient.pluginLogName}] Error creating project: ${projectStatus}`,
      );
      throw new Error(`Failed to create project`);
    }
    this.logOutput('info', `The project is ready.`);
    projectData.url = `${this.ansibleConfig.baseUrl}/execution/projects/${projectData.id}/details`;
    return projectData;
  }

  private async deleteExecutionEnvironmentExists(
    name: string,
    organization: Organization,
  ): Promise<void> {
    this.logOutput(
      'info',
      `Check if execution environment with name ${name} exist in organization.`,
    );
    const endPoint = `api/controller/v2/execution_environments/?organization=${organization.id}&name=${name}`;
    const environments = await this.executeGetRequest(endPoint);
    const environmentsList = await environments.json();
    if (environmentsList.results.length === 1) {
      this.logOutput(
        'info',
        `Delete execution environment with id: ${environmentsList.results[0].id}.`,
      );
      await this.deleteExecutionEnvironment(environmentsList.results[0].id);
      this.logOutput(
        'info',
        `End delete execution environment with id: ${environmentsList.results[0].id}.`,
      );
    }
  }

  async createExecutionEnvironment(
    payload: ExecutionEnvironment,
    deleteIfExist?: boolean,
  ): Promise<ExecutionEnvironment> {
    if (deleteIfExist) {
      await this.deleteExecutionEnvironmentExists(
        payload.environmentName,
        payload.organization,
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
      `[${AAPApiClient.pluginLogName}] Scaffolder creating new AAP execution environment at ${this.ansibleConfig.baseUrl}.`,
    );
    this.logOutput(
      'info',
      `Begin creating execution environment ${payload.environmentName}.`,
    );
    const response = await this.executePostRequest(endPoint, data);
    this.logOutput(
      'info',
      `End creating execution environment ${payload.environmentName}.`,
    );
    const eeData = (await response.json()) as ExecutionEnvironment;
    eeData.url = `${this.ansibleConfig.baseUrl}/execution/infrastructure/execution-environments/${eeData.id}/details`;
    return eeData;
  }

  private async deleteExecutionEnvironment(environmentID: number) {
    const endPoint = `api/controller/v2/execution_environments/${environmentID}/`;
    return await this.executeDeleteRequest(endPoint);
  }

  private async deleteJobTemplate(templateID: number) {
    const endPoint = `api/controller/v2/job_templates/${templateID}/`;
    return await this.executeDeleteRequest(endPoint);
  }

  private async deleteJobTemplateIfExists(
    name: string,
    organization: Organization,
  ): Promise<void> {
    const endPoint = `api/controller/v2/job_templates/?organization=${organization.id}&name=${name}`;
    this.logOutput(
      'info',
      `Check if job template with name ${name} exist in organization.`,
    );
    const templates = await this.executeGetRequest(endPoint);
    const templatesList = await templates.json();
    if (templatesList.results.length === 1) {
      this.logOutput(
        'info',
        `Delete job template with id: ${templatesList.results[0].id}.`,
      );
      await this.deleteJobTemplate(templatesList.results[0].id);
      this.logOutput(
        'info',
        `End delete job template with id: ${templatesList.results[0].id}.`,
      );
    }
  }

  async createJobTemplate(
    payload: JobTemplate,
    deleteIfExist: boolean,
  ): Promise<JobTemplate> {
    if (deleteIfExist) {
      await this.deleteJobTemplateIfExists(
        payload.templateName,
        payload.organization,
      );
    }
    const endPoint = 'api/controller/v2/job_templates/';
    const data = {
      name: payload.templateName,
      description: payload?.templateDescription ?? '',
      job_type: 'run',
      inventory: payload.jobInventory.id,
      project: payload.project.id,
      playbook: payload.playbook,
      execution_environment: payload?.executionEnvironment?.id ?? '',
      extra_vars: payload?.extraVariables
        ? YAML.stringify(payload.extraVariables)
        : '',
    };
    this.logOutput(
      'info',
      `Begin creating job template ${payload.templateName}.`,
    );
    const response = await this.executePostRequest(endPoint, data);
    const jobTemplate = (await response.json()) as JobTemplate;
    this.logOutput(
      'info',
      `End creating job template ${payload.templateName}.`,
    );
    jobTemplate.url = `${this.ansibleConfig.baseUrl}/execution/templates/job-template/${jobTemplate.id}/details`;
    return jobTemplate;
  }

  private async fetchEvents(
    jobID: number,
    results?: never[],
    fullUrl?: string,
  ): Promise<any> {
    let result = results ? results : [];
    const eventsResponse = await this.executeGetRequest(
      `api/controller/v2/jobs/${jobID}/job_events/`,
      fullUrl,
    );
    const response = await eventsResponse.json();
    result = [...result, ...response.results] as never[];
    if (response.next) {
      return await this.fetchEvents(jobID, result, response.next);
    }
    return result;
  }

  private async fetchResult(jobID: number) {
    let dummy = true;
    const endPoint = `api/controller/v2/jobs/${jobID}/`;
    let jobDetailResponseData;
    while (dummy) {
      await this.sleep(100);
      const jobDetailResponse = await this.executeGetRequest(endPoint);
      jobDetailResponseData = await jobDetailResponse.json();
      const status = jobDetailResponseData.status;
      if (
        ['successful', 'failed', 'error', 'canceled'].includes(
          status.toString().toLowerCase(),
        )
      ) {
        dummy = false;
        break;
      }
    }
    return {
      jobEvents: await this.fetchEvents(jobID),
      jobData: jobDetailResponseData,
    };
  }

  async launchJobTemplate(payload: LaunchJobTemplate): Promise<any> {
    const endPoint = `api/controller/v2/job_templates/${payload.template.id}/launch/`;
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
    if (payload?.verbosity?.id) {
      data.verbosity = payload.verbosity.id;
    }
    if (payload?.jobSliceCount || payload.jobSliceCount === 0) {
      data.job_slice_count = payload.jobSliceCount;
    }
    if (payload?.timeout || payload.timeout === 0) {
      data.job_slice_count = payload.timeout;
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
      const duplicates = [] as string[];
      payload.credentials.some(currentObject => {
        if (seen.size === seen.add(currentObject.credential_type).size) {
          duplicates.push(currentObject.summary_fields.credential_type.name);
          return true;
        }
        return false;
      });
      if (duplicates.length) {
        throw new Error(
          `Cannot assign multiple credentials of the same type. Duplicated credential types are: ${duplicates.join(', ')}`,
        );
      }
      data.credentials = payload.credentials.map(c => c.id);
    }
    this.logOutput('info', `Start executing job template.`);
    const response = await this.executePostRequest(endPoint, data);
    const jobResponseJson = await response.json();
    const jobID = jobResponseJson.job;
    this.logOutput('info', `Waiting for result of the executed job template.`);
    const result = await this.fetchResult(jobID);
    let lastEvent;
    if (result.jobData.status !== 'successful') {
      try {
        lastEvent =
          result.jobEvents[result.jobEvents.length - 2].event_data.res
            .results[0].msg;
      } catch (error) {
        lastEvent =
          'with an undefined error. Please check the RHAAP portal for job execution logs.';
      }
      this.logOutput('info', `Job has failed ${lastEvent}`);
      throw new Error(`Job execution failed due to ${lastEvent}`);
    }
    return {
      id: jobID,
      status: result.jobData.status,
      events: result.jobEvents,
      url: `${this.ansibleConfig.baseUrl}/execution/jobs/playbook/${jobID}/output`,
    };
  }

  async cleanUp(payload: CleanUp): Promise<void> {
    if (payload?.project?.id) {
      this.logOutput('info', `Delete project with id ${payload.project.id}.`);
      await this.deleteProject(payload.project.id);
    }
    if (payload?.template?.id) {
      this.logOutput('info', `Delete template with id ${payload.template.id}.`);
      await this.deleteJobTemplate(payload.template.id);
    }
    if (payload?.executionEnvironment?.id) {
      this.logOutput(
        'info',
        `Delete execution environment with id ${payload.executionEnvironment.id}.`,
      );
      await this.deleteExecutionEnvironment(payload.executionEnvironment.id);
    }
  }

  async getResourceData(resource: string) {
    const endPoint = `api/controller/v2/${resource}/`;
    const response = await this.executeGetRequest(endPoint);
    return await response.json();
  }

  async getJobTemplatesByName(
    templateNames: string[],
    organization: Organization,
  ): Promise<AAPTemplate[]> {
    const endPoint = `api/controller/v2/job_templates/?organization=${organization.id}&name__in=${templateNames}`;
    const response = await this.executeGetRequest(endPoint);
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
}
