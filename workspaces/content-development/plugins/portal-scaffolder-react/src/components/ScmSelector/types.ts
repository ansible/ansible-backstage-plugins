type ProviderType = 'github' | 'gitlab';

interface ProviderConfig {
  label: string;
  provider: ProviderType;
  host?: string;
  apiBaseUrl?: string;
}

export interface ScmSelectorOptions {
  providers?: ProviderConfig[];
  requestUserCredentials?: {
    secretsKey: string;
    additionalScopes?: {
      github?: string[];
      gitlab?: string[];
    };
  };
}

export interface ScmSelectorData {
  provider: string;
  providerLabel: string;
  org: string;
  repoName: string;
  repoExists: boolean;
  /** Present only while a restored selection is waiting for credentials. */
  authenticationPending?: true;
}
