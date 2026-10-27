export interface UserJobTemplate {
  id: number;
  name: string;
}

export interface AnsibleApi {
  syncTemplates(): Promise<boolean>;
  syncOrgsUsersTeam(): Promise<boolean>;
  getUserJobTemplates(): Promise<{ items: UserJobTemplate[] }>;
  getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: {
        lastSync: string | null;
        syncInProgress: boolean;
      };
      jobTemplates: {
        lastSync: string | null;
        syncInProgress: boolean;
      };
    };
  }>;
}

/** Target registry for pushing a built execution environment image. */
export type EEBuildRegistryType = 'pah' | 'custom';

export interface EEBuildRequest {
  entityRef: string;
  registryType: EEBuildRegistryType;
  /**
   * Registry URL sent for every build: PAH uses `ansible.rhaap.baseUrl` from app-config;
   * custom uses the user-entered URL.
   */
  customRegistryUrl: string;
  imageName: string;
  imageTag: string;
  verifyTls: boolean;
}

export interface EEBuildResult {
  accepted: boolean;
  /** CI/workflow run id when returned by the catalog build API (JSON `workflowId` or `workflow_id`). */
  workflowId?: string;
  /** Link to the workflow run when returned */
  workflowUrl?: string;
  /** GitLab pipeline ID when returned */
  pipelineId?: string;
  /** Link to the GitLab pipeline when returned */
  pipelineUrl?: string;
  message?: string;
}

export interface EEBuildTriggerOptions {
  scmToken: string;
  scmProvider: 'github' | 'gitlab';
}

export interface EEBuildApi {
  triggerBuild(
    request: EEBuildRequest,
    options: EEBuildTriggerOptions,
  ): Promise<EEBuildResult>;
}
