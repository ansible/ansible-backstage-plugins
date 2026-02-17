import type { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { Adapter, Enforcer, Model } from 'casbin';
import { RoleMetadataStorage } from '../src/database/role-metadata';
import { RBACPermissionPolicy } from '../src/policies/permission-policy';
import { EnforcerDelegate } from '../src/service/enforcer-delegate';
import { Entity } from '@backstage/catalog-model';
export declare function newConfig(permFile?: string, users?: Array<{
    name: string;
}>, superUsers?: Array<{
    name: string;
}>): Config;
export declare function newAdapter(config: Config): Promise<Adapter>;
export declare function createEnforcer(theModel: Model, adapter: Adapter, logger: LoggerService, config: Config): Promise<Enforcer>;
export declare function newEnforcerDelegate(adapter: Adapter, config: Config, storedPolicies?: string[][], storedGroupingPolicies?: string[][]): Promise<EnforcerDelegate>;
export declare function newPermissionPolicy(config: Config, enfDelegate: EnforcerDelegate, roleMock?: RoleMetadataStorage): Promise<RBACPermissionPolicy>;
export declare function convertGroupsToEntity(groups?: {
    name: string;
    namespace?: string | null;
    title: string;
    children: never[];
    parent: string | null;
    hasMember: string[];
}[]): Entity[];
export declare function convertUsersToEntity(): Entity[];
