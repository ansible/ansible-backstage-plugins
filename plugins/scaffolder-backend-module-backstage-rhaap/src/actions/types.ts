export interface Collection {
  name: string;
  version?: string;
  source?: string;
  type?: string;
}

export interface ScmServer {
  id: string;
  hostname: string;
  token_env_var: string;
}

export interface AdditionalBuildStep {
  stepType:
    | 'prepend_base'
    | 'append_base'
    | 'prepend_galaxy'
    | 'append_galaxy'
    | 'prepend_builder'
    | 'append_builder'
    | 'prepend_final'
    | 'append_final';
  commands: string[];
}

export interface EEDefinitionInput {
  eeFileName: string;
  eeDescription: string;
  customBaseImage?: string;
  tags: string[];
  publishToSCM: boolean;
  baseImage: string;
  collections?: Collection[];
  pythonRequirements?: string[];
  pythonRequirementsFile?: string;
  systemPackages?: string[];
  systemPackagesFile?: string;
  additionalBuildSteps?: AdditionalBuildStep[];
  buildRegistry?: string;
  buildImageName?: string;
  registryTlsVerify?: boolean;
  owner?: string;
}
