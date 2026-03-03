import { AAPResourcePicker } from '../Scaffolder/AAResourcePicker/AAPResourcePicker';
import { AAPTokenField } from '../Scaffolder/AAPTokenField/AAPTokenFieldExtension';
import { BaseImagePickerExtension } from '../Scaffolder/BaseImagePicker/BaseImagePickerExtension';
import { CollectionsPickerExtension } from '../Scaffolder/CollectionsPicker/CollectionsPickerExtension';
import { FileUploadPickerExtension } from '../Scaffolder/FileUploadPicker/FileUploadPickerExtension';
import { PackagesPickerExtension } from '../Scaffolder/PackagesPicker/PackagesPickerExtension';
import { MCPServersPickerExtension } from '../Scaffolder/MCPServersPicker/MCPServersPickerExtension';
import { AdditionalBuildStepsPickerExtension } from '../Scaffolder/AdditionalBuildStepsPicker/AdditionalBuildStepsPickerExtension';
import { EEFileNamePickerExtension } from '../Scaffolder/EEFileNamePicker/EEFileNamePickerExtension';
import { EETagsPickerExtension } from '../Scaffolder/EETagsPicker/EETagsPickerExtension';
import {
  EntityNamePicker,
  EntityNamePickerSchema,
  entityNamePickerValidation,
  EntityPicker,
  EntityPickerSchema,
  EntityTagsPicker,
  EntityTagsPickerSchema,
  MultiEntityPicker,
  MultiEntityPickerSchema,
  MyGroupsPicker,
  MyGroupsPickerSchema,
  OwnedEntityPicker,
  OwnedEntityPickerSchema,
  OwnerPicker,
  OwnerPickerSchema,
  RepoBranchPicker,
  RepoBranchPickerSchema,
  repoPickerValidation,
  RepoUrlPicker,
  RepoUrlPickerSchema,
  SecretInput,
  validateMultiEntityPickerValidation,
} from './BsCustomComponents';

export const formExtraFields = [
  { name: 'AAPResourcePicker', component: AAPResourcePicker },
  { name: 'AAPTokenField', component: AAPTokenField },
  { name: 'BaseImagePicker', component: BaseImagePickerExtension },
  { name: 'CollectionsPicker', component: CollectionsPickerExtension },
  { name: 'FileUploadPicker', component: FileUploadPickerExtension },
  { name: 'PackagesPicker', component: PackagesPickerExtension },
  { name: 'MCPServersPicker', component: MCPServersPickerExtension },
  {
    name: 'AdditionalBuildStepsPicker',
    component: AdditionalBuildStepsPickerExtension,
  },
  {
    name: 'EEFileNamePicker',
    component: EEFileNamePickerExtension,
  },
  {
    name: 'EETagsPicker',
    component: EETagsPickerExtension,
  },
  {
    component: EntityPicker,
    name: 'EntityPicker',
    schema: EntityPickerSchema,
  },
  {
    name: 'EntityNamePicker',
    component: EntityNamePicker,
    schema: EntityNamePickerSchema,
    validation: entityNamePickerValidation,
  },
  {
    name: 'EntityTagsPicker',
    component: EntityTagsPicker,
    schema: EntityTagsPickerSchema,
  },
  {
    name: 'RepoUrlPicker',
    component: RepoUrlPicker,
    schema: RepoUrlPickerSchema,
    validation: repoPickerValidation,
  },
  {
    name: 'OwnerPicker',
    component: OwnerPicker,
    schema: OwnerPickerSchema,
  },
  {
    name: 'OwnedEntityPicker',
    component: OwnedEntityPicker,
    schema: OwnedEntityPickerSchema,
  },
  {
    name: 'MyGroupsPicker',
    component: MyGroupsPicker,
    schema: MyGroupsPickerSchema,
  },
  {
    name: 'Secret',
    component: SecretInput,
  },
  {
    name: 'MultiEntityPicker',
    component: MultiEntityPicker,
    schema: MultiEntityPickerSchema,
    validation: validateMultiEntityPickerValidation,
  },
  {
    name: 'RepoBranchPicker',
    component: RepoBranchPicker,
    schema: RepoBranchPickerSchema,
  },
];
