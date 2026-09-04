/*
 * Copyright Red Hat
 *
 * Git Repos is a host: it renders whatever guests registered, and nothing
 * when nobody has. `useApi(gitRepositoriesExtensionsApiRef)` throws
 * NotImplementedError until a factory is on the host — so a portal without
 * a guest plugin would crash the page. Look up optionally and fall back to
 * the ADR-010 empty default.
 */

import { useApiHolder } from '@backstage/core-plugin-api';
import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
  type GitRepositoriesExtensionsApi,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';

const FALLBACK = new DefaultGitRepositoriesExtensionsApi();

export function useGitRepositoriesExtensions(): GitRepositoriesExtensionsApi {
  const holder = useApiHolder();
  return holder.get(gitRepositoriesExtensionsApiRef) ?? FALLBACK;
}
