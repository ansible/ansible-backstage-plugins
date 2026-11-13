import portal from '@ansible/portal-core/alpha';
import navigation from '@ansible/portal-core/app-nav';
import * as hostAdapters from '@ansible/portal-extension-host/alpha';
import rhdh from '@ansible/portal-rhdh/alpha';
import auth from '@ansible/aap-app-auth/alpha';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
export const frontend = [portal, navigation, rhdh, auth];
export const authApi = rhAapAuthApiRef;

export const adapters = hostAdapters;
