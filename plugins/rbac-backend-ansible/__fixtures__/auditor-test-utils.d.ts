import type { AuditorServiceCreateEventOptions } from '@backstage/backend-plugin-api';
import { type JsonObject } from '@backstage/types';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
export declare function expectAuditorLog(events: {
    event: AuditorServiceCreateEventOptions;
    success?: {
        meta?: JsonObject;
    };
    fail?: {
        meta?: JsonObject;
        error: Error;
    };
}[]): void;
export declare function expectAuditorLogForPermission(user: string | undefined, permissionName: string, resourceType: string | undefined, action: string, result: AuthorizeResult): void;
export declare function clearAuditorMock(): void;
