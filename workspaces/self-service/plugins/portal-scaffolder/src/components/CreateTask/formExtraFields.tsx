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
import { ScmSelectorExtension } from '../Scaffolder/ScmSelector/ScmSelectorExtension';
import {
  EntityNamePicker,
  EntityPicker,
  EntityTagsPicker,
  MultiEntityPicker,
  MyGroupsPicker,
  OwnedEntityPicker,
  OwnerPicker,
  RepoBranchPicker,
  RepoUrlPicker,
  SecretInput,
} from './BsCustomComponents';

export const formExtraFields = [
  { name: 'AAPResourcePicker', component: AAPResourcePicker },
  { name: 'AAPTokenField', component: AAPTokenField },
  { name: 'BaseImagePicker', component: BaseImagePickerExtension },
  { name: 'CollectionsPicker', component: CollectionsPickerExtension },
  { name: 'FileUploadPicker', component: FileUploadPickerExtension },
  { name: 'PackagesPicker', component: PackagesPickerExtension },
  { name: 'MCPServersPicker', component: MCPServersPickerExtension },
  { name: 'ScmSelector', component: ScmSelectorExtension },
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
  { name: 'EntityPicker', component: EntityPicker },
  { name: 'EntityNamePicker', component: EntityNamePicker },
  { name: 'EntityTagsPicker', component: EntityTagsPicker },
  { name: 'RepoUrlPicker', component: RepoUrlPicker },
  { name: 'OwnerPicker', component: OwnerPicker },
  { name: 'OwnedEntityPicker', component: OwnedEntityPicker },
  { name: 'MyGroupsPicker', component: MyGroupsPicker },
  { name: 'Secret', component: SecretInput },
  { name: 'MultiEntityPicker', component: MultiEntityPicker },
  { name: 'RepoBranchPicker', component: RepoBranchPicker },
];
