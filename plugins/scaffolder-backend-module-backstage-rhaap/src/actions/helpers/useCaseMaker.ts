import { Octokit } from '@octokit/core';
import type { OctokitOptions } from '@octokit/core/dist-types/types.d';
import * as YAML from 'yaml';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AAPApiClient } from './apis';
import type { OctokitResponse } from '@octokit/types/dist-types/OctokitResponse';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Git } from './scm';
import { randomBytes } from 'crypto';

import {
  AAPTemplate,
  Organization,
  UseCase,
  AnsibleConfig,
  CreatedTemplate,
  ParsedTemplate,
  BackstageAAPShowcase,
} from '../../types';
import { Logger } from 'winston';

export type GithubConfig = {
  url: string;
  githubRepo: string;
  githubBranch: string;
  githubUser: string;
  githubEmail: string;
  githubToken: string;
  githubOrganizationName: string | null;
};

export class UseCaseMaker {
  static pluginLogName =
    'plugin-scaffolder-backend-module-backstage-rhaap:UseCaseMaker';
  private readonly logger: LoggerService;
  private readonly organization!: Organization;
  private ansibleConfig: AnsibleConfig;
  private apiClient!: AAPApiClient;
  private readonly useCases: UseCase[];
  private showCaseFolder: string;
  private octokit: Octokit;
  private readonly winstonLogger: Logger;
  constructor({
    ansibleConfig,
    logger,
    organization,
    apiClient,
    useCases,
    winstonLogger,
  }: {
    ansibleConfig: AnsibleConfig;
    apiClient: AAPApiClient | null;
    organization: Organization | null;
    logger: LoggerService;
    useCases: UseCase[];
    winstonLogger: Logger;
  }) {
    this.ansibleConfig = ansibleConfig;
    this.logger = logger;
    if (organization) {
      this.organization = organization;
    }
    if (apiClient) {
      this.apiClient = apiClient;
    }
    this.useCases = useCases;
    this.showCaseFolder =
      this.ansibleConfig..type === 'file'
        ? (this.ansibleConfig.?.target ?? '')
        : '';
    const octokitOptions = {
      baseUrl: this.ansibleConfig.gitHubIntegration.apiBaseUrl,
    } as OctokitOptions;
    if (this.ansibleConfig.gitHubIntegration.token) {
      octokitOptions.auth = this.ansibleConfig.gitHubIntegration.token;
    }
    this.octokit = new Octokit(octokitOptions);
    this.winstonLogger = winstonLogger;
  }

  private async fetchGithubData(options: {
    url: string;
  }): Promise<OctokitResponse<any, number> | null> {
    const { url } = options;
    let response;
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Fetching GitHub data ${url}.`,
    );
    try {
      response = await this.octokit.request(`GET ${url}`, {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          accept: 'application/vnd.github+json',
        },
      });
    } catch (e) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Error fetching GitHub data ${url}. ${e}`,
      );
    }
    if (response && response.status === 200) {
      return response;
    }
    this.logger.error(
      `[${UseCaseMaker.pluginLogName}] Error fetching GitHub data ${url}. ${response}`,
    );
    return null;
  }

  private async getAAPJobTemplate(options: {
    name: string;
  }): Promise<AAPTemplate | null> {
    const { name } = options;
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Try to fetch AAP job template ${name}.`,
    );
    let response: { id: number; name: string }[];
    try {
      response = await this.apiClient.getJobTemplatesByName(
        [name],
        this.organization,
      );
    } catch (e) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Error while fetching template ${name}: ${e} `,
      );
      return null;
    }
    if (response.length) {
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Successfully fetched AAP job template ${name}.`,
      );
      return response[0];
    }
    this.logger.error(
      `[${UseCaseMaker.pluginLogName}] Error while fetching template ${name}: Not found `,
    );
    return null;
  }

  private async getTemplatesLocation(options: {
    userName: string;
    repoName: string;
    branch: string;
  }): Promise<{ path: string; templateName: string }[]> {
    const { userName, repoName, branch } = options;
    const locations: { path: string; templateName: string }[] = [];

    const url = `/repos/${userName}/${repoName}/contents/extensions/patterns?ref=${branch}`;
    const locationsResponse = await this.fetchGithubData({ url });
    if (!locationsResponse || !Array.isArray(locationsResponse?.data)) {
      this.winstonLogger.warn('No locations found.');
      return locations;
    }
    const folders = locationsResponse.data.filter((r: any) => r.type === 'dir');
    this.winstonLogger.info(`Found ${folders.length} folders in gitHub.`);
    await Promise.all(
      folders.map(async (folder: any) => {
        this.winstonLogger.info(`Search for setup files`);
        const filesUrl = `/repos/${userName}/${repoName}/contents/${folder.path}?ref=${branch}`;
        const filesResponse = await this.fetchGithubData({ url: filesUrl });
        if (filesResponse && Array.isArray(filesResponse?.data)) {
          const setupFiles = filesResponse.data.filter(
            (f: any) =>
              f.type === 'file' &&
              (f.name === 'setup.yml' || f.name === 'setup.yaml'),
          );
          if (setupFiles.length) {
            const setupFileUrl = `/repos/${userName}/${repoName}/contents/${setupFiles[0].path}?ref=${branch}`;
            const setupFileResponse = await this.fetchGithubData({
              url: setupFileUrl,
            });
            if (setupFileResponse?.data?.content) {
              let jsonContent;
              try {
                jsonContent = YAML.parse(atob(setupFileResponse.data.content));
              } catch (e) {
                this.winstonLogger.error(
                  ` Error while parsing yaml file ${setupFileUrl}.`,
                );
                this.logger.error(
                  `[${UseCaseMaker.pluginLogName}] Error while parsing yaml file ${setupFileUrl}.`,
                );
              }
              if (
                jsonContent &&
                Array.isArray(jsonContent?.controller_templates)
              ) {
                await Promise.all(
                  jsonContent.controller_templates.map(
                    async (controllerTemplate: any) => {
                      const regex = /.*['"]template_surveys\/([^'"]+)/gm;
                      const templateName = controllerTemplate?.name ?? null;
                      const surveySpec = controllerTemplate?.survey_spec ?? '';
                      const tmp = regex.exec(surveySpec);
                      let filename;
                      if (Array.isArray(tmp) && tmp.length > 1) {
                        filename = tmp[1];
                      } else {
                        this.winstonLogger.warn(
                          `Filename of the template not found.`,
                        );
                      }
                      if (templateName && filename) {
                        this.winstonLogger.info(
                          `Added location for ${templateName}`,
                        );
                        locations.push({
                          path: `/repos/${userName}/${repoName}/contents/${folder.path}/template_rhdh/${filename}?ref=${branch}`,
                          templateName: templateName,
                        });
                      }
                    },
                  ),
                );
              }
            }
          } else {
            this.winstonLogger.warn(`No setup files found.`);
          }
        }
      }),
    );
    return locations;
  }

  private async getJsonTemplates(options: {
    useCase: UseCase;
  }): Promise<CreatedTemplate[]> {
    const { useCase } = options;
    const retval = [] as CreatedTemplate[];
    const userName = useCase.url.split('/').slice(-2)[0];
    const repoName = useCase.url.split('/').pop();
    if (!repoName) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Can't parse repo name from ${useCase.url}.`,
      );
      throw new Error(`Can't parse repo name from ${useCase.url}.`);
    }
    const branch = useCase.version;
    this.winstonLogger.info('Search for use case templates.');
    const templatesLocations = await this.getTemplatesLocation({
      userName,
      repoName,
      branch,
    });
    await Promise.all(
      templatesLocations.map(async location => {
        const template = await this.fetchGithubData({ url: location.path });
        let jsonTemplate;
        if (template && template?.data.content) {
          try {
            jsonTemplate = YAML.parse(atob(template.data.content));
          } catch (e) {
            this.logger.error(
              `[${UseCaseMaker.pluginLogName}] Error while parsing yaml template ${location.path}.`,
            );
          }
        }
        if (jsonTemplate) {
          retval.push({
            templateName: location.templateName,
            template: jsonTemplate,
          });
        }
      }),
    );
    return retval;
  }

  private parseTemplate(options: {
    jsonData: CreatedTemplate;
  }): ParsedTemplate | null {
    const { jsonData } = options;
    let spec;
    let steps;
    const githubTemplate = jsonData.template as {
      metadata?: {
        name?: string;
      };
      spec?: {
        steps?: {
          id: string;
          name: string;
          action: string;
          input: {
            values: {
              templateID?: number;
              template?: { id: number; name: string };
            };
          };
        }[];
      };
    };
    if (Object.hasOwn(githubTemplate, 'spec')) {
      spec = githubTemplate.spec;
    } else {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Template configuration incorrect. Missing key spec. ${jsonData.templateName}`,
      );
      return null;
    }
    if (spec && Object.hasOwn(spec, 'steps') && Array.isArray(spec.steps)) {
      steps = spec.steps;
    } else {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Template configuration incorrect. Missing key spec.steps. ${jsonData.templateName}`,
      );
      return null;
    }
    const index = steps.findIndex(
      s => s.action === 'rhaap:launch-job-template',
    );
    if (index < 0) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Template configuration incorrect. Missing action rhaap:launch-job-template ${jsonData.templateName}`,
      );
      return null;
    }
    const action = steps[index];
    if (!action?.input?.values) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Template configuration incorrect. Missing keys input.values ${jsonData.templateName}`,
      );
      return null;
    }
    delete action.input.values.templateID;
    if (jsonData.templateId) {
      action.input.values.template = {
        id: jsonData.templateId,
        name: jsonData.templateName,
      };
    } else {
      return null;
    }
    spec.steps[index] = action;
    githubTemplate.spec = spec;
    const filename = githubTemplate?.metadata?.name ?? null;
    if (!filename) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Template configuration incorrect. Missing keys metadata.filename ${jsonData.templateName}`,
      );
      return null;
    }
    return {
      filename: `${filename}.yaml`,
      fileContent: YAML.stringify(githubTemplate),
    };
  }

  private createFolder(options: { dirPath: string }) {
    const { dirPath } = options;
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Local folder ${dirPath} does not exists. Let's create it.`,
    );
    try {
      fs.mkdirSync(dirPath);
    } catch (e) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Error creating local folder ${dirPath}. ${e}`,
      );
      throw new Error(`Error creating local folder ${dirPath}.`);
    }
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Created local folder ${dirPath}.`,
    );
  }

  private async createFolderIfNotExists(dirPath: string) {
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Check if local folder ${dirPath} exists.`,
    );
    const isDirExist = await fs.promises
      .access(dirPath)
      .then(() => true)
      .catch(() => false);
    if (!isDirExist) {
      this.winstonLogger.info(`Creating local folder ${dirPath}`);
      this.createFolder({ dirPath });
    }
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Check if local folder ${dirPath}/templates exists.`,
    );
    const isTemplateDirExist = await fs.promises
      .access(`${dirPath}/templates`)
      .then(() => true)
      .catch(() => false);
    if (!isTemplateDirExist) {
      this.winstonLogger.info(`Creating local folder ${dirPath}/templates.`);
      this.createFolder({ dirPath: `${dirPath}/templates` });
    }
  }

  private async createAllFile(options: {
    dirPath: string;
    savedTemplates: string[];
    type: string;
  }) {
    const { dirPath, savedTemplates, type } = options;
    let allFileExists;
    const filePath = path.join(dirPath, 'all.yaml');
    try {
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Check if file ${filePath} exists.`,
      );
      this.winstonLogger.info('Creating file all.yaml');
      allFileExists = await fs.promises
        .access(filePath)
        .then(() => true)
        .catch(() => false);
    } catch (e) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Error checking if file  ${filePath} exists. ${e}`,
      );
      throw new Error('Error checking if file all.yaml exists');
    }

    let allFileContent: BackstageAAPShowcase;
    if (allFileExists) {
      try {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] File ${filePath} exists. Let's read it.`,
        );
        const data = fs.readFileSync(filePath, 'utf8');
        allFileContent = YAML.parse(data);
      } catch (e) {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Error reading file ${filePath}. ${e}`,
        );
        throw new Error('Error reading file ${filePath}.');
      }
    } else {
      allFileContent = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Location',
        metadata: {
          name: 'aap-showcases-entities',
          description: 'A collection of AAP show cases entities',
        },
        spec: {
          type: type,
          targets: [],
        },
      } as {
        apiVersion: string;
        kind: string;
        metadata: { name: string; description: string };
        spec: { targets: string[] };
      };
    }
    this.logger.info(
      `[${UseCaseMaker.pluginLogName}] Generating file ${filePath} content.`,
    );
    savedTemplates.forEach(savedTemplate => {
      const data = `./templates/${savedTemplate}`;
      if (!allFileContent.spec.targets.includes(data)) {
        allFileContent.spec.targets.push(data);
      }
    });
    try {
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Saving file ${filePath}.`,
      );
      this.winstonLogger.info(`Saving file ${filePath}.`);
      fs.writeFileSync(filePath, YAML.stringify(allFileContent));
    } catch (e) {
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Error saving file ${filePath}. ${e}`,
      );
      throw new Error(`Error saving file ${filePath}.`);
    }
  }

  private async writeLocally(options: {
    parsedTemplates: ParsedTemplate[];
    type?: string;
  }) {
    this.winstonLogger.info(`Begin saving templates locally.`);
    const { parsedTemplates, type = 'file' } = options;
    if (!this.ansibleConfig.) {
      throw new Error('Show case location not defined.');
    }
    const dirPath = this.showCaseFolder;
    if (!dirPath) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Ansible show case folder not configured.`,
      );
      throw new Error(`Ansible show case folder not configured.`);
    }

    await this.createFolderIfNotExists(dirPath);
    const savedTemplates = [] as string[];
    parsedTemplates.forEach(template => {
      try {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Saving template ${dirPath}/templates/${template.filename}.`,
        );
        const fileLocation = path.join(dirPath, 'templates', template.filename);
        fs.writeFileSync(fileLocation, template.fileContent);
        savedTemplates.push(template.filename);
      } catch (e) {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error saving template ${dirPath}/templates/${template.filename}. ${e}`,
        );
      }
    });
    await this.createAllFile({ dirPath, savedTemplates, type });
    this.winstonLogger.info(`End saving templates locally.`);
  }

  private async createRepositoryIfNotExists(options: {
    githubConfig: GithubConfig;
  }): Promise<boolean> {
    const { githubConfig } = options;
    let response;
    let isNew = false;
    try {
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Check if github repo ${githubConfig.githubRepo} exists`,
      );
      this.winstonLogger.info(
        `Check if github repo ${githubConfig.githubRepo} exists.`,
      );
      response = await this.octokit.request('GET /repos/{owner}/{repo}', {
        owner: githubConfig.githubOrganizationName ?? githubConfig.githubUser,
        repo: githubConfig.githubRepo,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          accept: 'application/vnd.github+json',
        },
      });
    } catch (e: any) {
      if (e?.status === 404) {
        response = null;
      } else {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error checking if github repo ${githubConfig.githubRepo} exists. ${e}`,
        );
        throw new Error(
          `Error checking if github repo ${githubConfig.githubRepo} exists.`,
        );
      }
    }

    if (response === null) {
      this.winstonLogger.info(
        `Creating gitHub repo ${githubConfig.githubRepo}.`,
      );
      isNew = true;
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Github repo ${githubConfig.githubRepo} does not exists. Let's make it.`,
      );
      let createRepoResponse: OctokitResponse<any>;
      try {
        if (githubConfig.githubOrganizationName) {
          createRepoResponse = await this.octokit.request(
            'POST /orgs/{org}/repos',
            {
              org: githubConfig.githubOrganizationName,
              name: githubConfig.githubRepo,
              headers: {
                'X-GitHub-Api-Version': '2022-11-28',
              },
            },
          );
        } else {
          createRepoResponse = await this.octokit.request('POST /user/repos', {
            name: githubConfig.githubRepo,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
        }
      } catch (e) {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error creating github repo ${githubConfig.githubRepo}. ${e}`,
        );
        throw new Error(
          `Error creating github repo ${githubConfig.githubRepo}.`,
        );
      }
      if (createRepoResponse.status !== 201) {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error creating github repo ${githubConfig.githubRepo}. ${createRepoResponse}`,
        );
        throw new Error(
          `Error creating github repo ${githubConfig.githubRepo}.`,
        );
      }

      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Github repo ${githubConfig.githubRepo} successfully created.`,
      );
      this.winstonLogger.info(
        `End creating gitHub repo ${githubConfig.githubRepo}.`,
      );
    } else {
      this.winstonLogger.info(`Github repo ${githubConfig.githubRepo} exists.`);
      let branchesResponse;
      try {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Github repo ${githubConfig.githubRepo} exists. Fetching branches`,
        );
        branchesResponse = await this.octokit.request(
          'GET /repos/{owner}/{repo}/branches',
          {
            owner:
              githubConfig.githubOrganizationName ?? githubConfig.githubUser,
            repo: githubConfig.githubRepo,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );
      } catch (e) {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error fetching repo branches ${githubConfig.githubRepo}. ${e}`,
        );
        throw new Error(
          `Error fetching repo branches ${githubConfig.githubRepo}.`,
        );
      }
      if (branchesResponse.status === 200) {
        isNew = branchesResponse.data.length === 0;
      } else {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error fetching repo branches ${githubConfig.githubRepo}. ${branchesResponse}`,
        );
        throw new Error(
          `Error fetching repo branches ${githubConfig.githubRepo}.`,
        );
      }
    }
    return isNew;
  }

  private async createGitHubContent(options: {
    githubConfig: GithubConfig;
    parsedTemplates: ParsedTemplate[];
    isNewRepo: boolean;
  }) {
    const { githubConfig, parsedTemplates, isNewRepo } = options;
    const tempDir = os.tmpdir();
    const folderName = `aap_content_${new Date().getTime()}`;
    this.showCaseFolder = path.join(tempDir, folderName);
    this.createFolder({ dirPath: this.showCaseFolder });
    try {
      const git = Git.fromAuth({
        username: githubConfig.githubUser,
        password: githubConfig.githubToken,
      });
      this.logger.info(`[${UseCaseMaker.pluginLogName}] Init git.`);
      await git.init({
        dir: this.showCaseFolder,
        defaultBranch: githubConfig.githubBranch,
      });
      if (isNewRepo) {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Creating new branch ${this.showCaseFolder} - ${githubConfig.githubBranch}.`,
        );
        await git.createBranch({
          dir: this.showCaseFolder,
          ref: githubConfig.githubBranch,
        });
      } else {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Cloning git repo ${githubConfig.url}.git`,
        );
        await git.clone({
          url: `${githubConfig.url}.git`,
          dir: this.showCaseFolder,
        });
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Fetching into ${this.showCaseFolder}`,
        );
        await git.fetch({ dir: this.showCaseFolder });
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Checkout or create branch ${this.showCaseFolder}`,
        );
        await git.checkoutOrCreate({
          dir: this.showCaseFolder,
          ref: githubConfig.githubBranch,
        });
      }
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Creating local content ${this.showCaseFolder}`,
      );
      const type = 'url';
      await this.writeLocally({ parsedTemplates, type });
      this.logger.info(
        `[${UseCaseMaker.pluginLogName}] Commit and push to remote ${this.showCaseFolder}`,
      );
      this.winstonLogger.info(`Start commit and push.`);
      await git.commitAndPush({
        url: `${githubConfig.url}.git`,
        dir: this.showCaseFolder,
        gitAuthorInfo: {
          email: githubConfig.githubEmail,
          name: githubConfig.githubUser,
        },
        commitMessage: `AAP showcase templates at: ${new Date().toString()}`,
        branch: githubConfig.githubBranch,
      });
      this.winstonLogger.info(`End commit and push.`);
    } catch (e) {
      this.logger.error(`[${UseCaseMaker.pluginLogName}] Git error ${e}`);
      throw new Error('Something went wrong: git error.');
    } finally {
      try {
        this.logger.info(
          `[${UseCaseMaker.pluginLogName}] Removing temp folder ${this.showCaseFolder}`,
        );
        await fs.promises.rm(this.showCaseFolder, {
          recursive: true,
          force: true,
        });
      } catch (e) {
        this.logger.error(
          `[${UseCaseMaker.pluginLogName}] Error while removing temp folder ${this.showCaseFolder} ${e}`,
        );
      }
      this.showCaseFolder = '';
    }
  }

  private async pushToGithub(options: { parsedTemplates: ParsedTemplate[] }) {
    const { parsedTemplates } = options;
    if (
      !this.ansibleConfig?.?.target ||
      !this.ansibleConfig?.gitHubIntegration.token ||
      !this.ansibleConfig?.?.githubEmail ||
      !this.ansibleConfig?.?.githubUser
    ) {
      throw new Error('Missing show case target github configuration');
    }
    let url;
    try {
      url = new URL(this.ansibleConfig..target);
    } catch (e) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] Not valid github url ${this.ansibleConfig..target}.`,
      );
      throw new Error(
        `Not valid github url ${this.ansibleConfig..target}.`,
      );
    }
    const githubConfig = {
      url: `${url.origin}${url.pathname.replace('/orgs/', '/')}`,
      githubBranch: this.ansibleConfig..githubBranch,
      githubEmail: this.ansibleConfig..githubEmail,
      githubUser: this.ansibleConfig..githubUser,
      githubRepo: this.ansibleConfig..target.split('/').pop(),
      githubToken: this.ansibleConfig.gitHubIntegration.token,
      githubOrganizationName: url.pathname.startsWith('/orgs/')
        ? url.pathname.split('/')[2]
        : null,
    } as GithubConfig;

    const isNewRepo = await this.createRepositoryIfNotExists({
      githubConfig,
    });
    this.winstonLogger.info(`Start creating gitHub content.`);
    await this.createGitHubContent({
      githubConfig,
      parsedTemplates,
      isNewRepo,
    });
    this.winstonLogger.info(`End creating gitHub content.`);
  }

  async devfilePushToGithub(options: { value: string; repositoryUrl: string }) {
    // Extract repository owner and name from the URL
    const repoUrlPattern = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;
    const matches = options.repositoryUrl.match(repoUrlPattern);
    if (!matches) {
      throw new Error('Invalid repository URL');
    }

    const owner = matches[1];
    const repo = matches[2];
    this.logger.info(owner);
    this.logger.info(repo);
    if (!this.ansibleConfig?.gitHubIntegration.token) {
      throw new Error('Missing show case target GitHub configuration');
    }
    this.logger.info('in devfile push to github');

    const octokit = new Octokit({
      auth: this.ansibleConfig?.gitHubIntegration.token,
    });

    // Prepare the content for devfile.yaml (i.e., the raw string value)
    const devfileContent = options.value;

    try {
      // Step 1: Get the repository's default branch
      const { data: repoData } = await octokit.request(
        'GET /repos/{owner}/{repo}',
        {
          owner,
          repo,
        },
      );

      const defaultBranch = repoData.default_branch;
      this.logger.info(defaultBranch);

      // Step 2: Get the reference for the default branch (to create a new branch)
      const { data: refData } = await octokit.request(
        'GET /repos/{owner}/{repo}/git/refs/heads/{branch}',
        {
          owner,
          repo,
          branch: defaultBranch,
        },
      );
      this.logger.info(refData.object.sha);

      // Create a new branch (use the current timestamp to ensure uniqueness)
      if (!refData || !refData.object || !refData.object.sha) {
        this.logger.info(
          'Unable to fetch the latest commit SHA for the default branch',
        );
      }

      const newBranchName = `create-devfile-${randomBytes(2).toString('hex')}`;
      await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner,
        repo,
        ref: `refs/heads/${newBranchName}`,
        sha: refData.object.sha, // Using the sha of the default branch to create the new branch
      });

      // Step 3: Create a new file (devfile.yaml) in the new branch
      const newContent = Buffer.from(devfileContent).toString('base64'); // Base64 encode content for GitHub API
      const commitMessage = 'Create devfile.yaml with new content';
      let shaValue;

      try {
        const result = await octokit.request(
          'GET /repos/{owner}/{repo}/contents/{path}',
          {
            owner,
            repo,
            path: 'devfile.yaml',
            ref: defaultBranch,
          },
        );
        // If the result is an array, we need to extract the sha from the specific file object
        if (Array.isArray(result.data)) {
          // Look for the 'devfile.yaml' file in the directory
          const fileData = result.data.find(
            item => item.path === 'devfile.yaml',
          );
          shaValue = fileData?.sha;
        } else {
          // If the result is a single file, check if it's a file object and contains sha
          if (result.data.sha) {
            shaValue = result.data.sha;
          }
        }
      } catch (error) {
        // If the file doesn't exist, shaValue will remain undefined
        shaValue = undefined;
      }
      this.logger.info('result is here');

      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: 'devfile.yaml', // Path for the new file
        message: commitMessage,
        content: newContent, // The base64-encoded content of the new file
        branch: newBranchName, // Use the new branch
        sha: shaValue,
      });

      // Step 4: Create a pull request to merge the changes
      const prTitle = 'Add devfile.yaml';
      const prBody =
        'This PR creates a new devfile.yaml file with the provided content.';

      const { data: prData } = await octokit.request(
        'POST /repos/{owner}/{repo}/pulls',
        {
          owner,
          repo,
          title: prTitle,
          head: newBranchName, // The branch with new file
          base: defaultBranch, // The default branch to merge into
          body: prBody,
        },
      );

      console.log(`Pull request created: ${prData.html_url}`);
      return prData.html_url;
    } catch (error) {
      console.error('Error creating pull request:', error);
      throw error;
    }
  }

  async makeTemplates() {
    if (!this.useCases.length) {
      this.logger.error(
        `[${UseCaseMaker.pluginLogName}] No uses cases provided.`,
      );
      throw new Error('No uses cases provided.');
    }
    const createdTemplates = [] as CreatedTemplate[];
    await Promise.all(
      this.useCases.map(async (useCase: UseCase) => {
        const useCaseTemplates = await this.getJsonTemplates({ useCase });
        useCaseTemplates.forEach(createdTemplate => {
          createdTemplates.push(createdTemplate);
        });
      }),
    );
    const parsedTemplates: ParsedTemplate[] = [];
    await Promise.all(
      createdTemplates.map(async template => {
        const appTemplate = await this.getAAPJobTemplate({
          name: template.templateName,
        });
        if (appTemplate?.id) {
          template.templateId = appTemplate.id;
          const parsedTemplate = this.parseTemplate({ jsonData: template });
          if (parsedTemplate) {
            parsedTemplates.push(parsedTemplate);
          }
        }
      }),
    );
    if (this.ansibleConfig.?.type === 'url') {
      await this.pushToGithub({ parsedTemplates });
    } else {
      await this.writeLocally({ parsedTemplates });
    }
  }
}
