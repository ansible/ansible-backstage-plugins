import { apmeApiFactory } from '@ansible/plugin-backstage-apme';
import { baseApis } from './baseApis';
import type { AnyApiFactory } from '@backstage/core-plugin-api';

/** Legacy app only. NFS obtains APME's API through its alpha declaration. */
export const apis: AnyApiFactory[] = [...baseApis, apmeApiFactory];
