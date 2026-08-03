import { PlatformSpec, PlatformValidationResult } from '@ansible/backstage-compliance-common';

export type { PlatformValidationResult };

export interface HostFacts {
  hostname: string;
  ansible_os_family?: string;
  ansible_distribution_major_version?: string;
  device_type?: string;
}

export function validatePlatform(
  spec: PlatformSpec | null,
  hosts: HostFacts[],
): PlatformValidationResult {
  // If no spec or scanner_validates, all hosts match
  if (!spec || spec.scanner_validates) {
    return { valid: true, matchedHosts: hosts.map(h => h.hostname), mismatchedHosts: [], factsAvailable: true };
  }

  const matched: string[] = [];
  const mismatched: Array<{ hostname: string; reason: string }> = [];
  let anyHostHasFacts = false;

  for (const host of hosts) {
    const hasFacts = !!(host.ansible_os_family || host.ansible_distribution_major_version || host.device_type);
    if (hasFacts) anyHostHasFacts = true;
    if (!hasFacts) {
      matched.push(host.hostname);
      continue;
    }

    const reasons: string[] = [];

    if (spec.os_family?.length && host.ansible_os_family && !spec.os_family.includes(host.ansible_os_family)) {
      reasons.push(`OS family '${host.ansible_os_family}' not in [${spec.os_family.join(', ')}]`);
    }

    if (spec.os_version?.length && host.ansible_distribution_major_version && !spec.os_version.includes(host.ansible_distribution_major_version)) {
      reasons.push(`OS version '${host.ansible_distribution_major_version}' not in [${spec.os_version.join(', ')}]`);
    }

    if (spec.device_type?.length && host.device_type && !spec.device_type.includes(host.device_type)) {
      reasons.push(`Device type '${host.device_type}' not in [${spec.device_type.join(', ')}]`);
    }

    if (reasons.length > 0) {
      mismatched.push({ hostname: host.hostname, reason: reasons.join('; ') });
    } else {
      matched.push(host.hostname);
    }
  }

  return {
    valid: mismatched.length === 0,
    matchedHosts: matched,
    mismatchedHosts: mismatched,
    factsAvailable: anyHostHasFacts,
  };
}
