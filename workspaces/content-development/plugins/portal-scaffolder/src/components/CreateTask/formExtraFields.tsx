import { AAPTokenField } from '../Scaffolder/AAPTokenField/AAPTokenFieldExtension';
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
  { name: 'AAPTokenField', component: AAPTokenField },
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
