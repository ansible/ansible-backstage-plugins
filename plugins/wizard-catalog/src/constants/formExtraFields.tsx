import { AAPResourcePicker } from '../components/Scaffolder/AAResourcePicker/AAPResourcePicker';
import { AAPTokenField } from '../components/Scaffolder/AAPTokenField/AAPTokenFieldExtension';
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
} from '../components/catalog/BsCustomComponents';

export const formExtraFields = [
  { name: 'AAPResourcePicker', component: AAPResourcePicker },
  { name: 'AAPTokenField', component: AAPTokenField },
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
