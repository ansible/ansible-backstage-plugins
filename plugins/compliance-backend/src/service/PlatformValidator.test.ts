import { validatePlatform } from './PlatformValidator';
import type { PlatformSpec } from '@ansible/backstage-compliance-common';
import type { HostFacts } from './PlatformValidator';

describe('PlatformValidator', () => {
  // ─── RHEL 9 match ──────────────────────────────────────────────────

  it('matches RHEL 9 host against RHEL spec', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'], os_version: ['9'] };
    const hosts: HostFacts[] = [
      { hostname: 'rhel01', ansible_os_family: 'RedHat', ansible_distribution_major_version: '9' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toEqual(['rhel01']);
    expect(result.mismatchedHosts).toEqual([]);
  });

  // ─── Windows mismatch ──────────────────────────────────────────────

  it('rejects Windows host against RHEL spec', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'], os_version: ['9'] };
    const hosts: HostFacts[] = [
      { hostname: 'win01', ansible_os_family: 'Windows', ansible_distribution_major_version: '2022' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(false);
    expect(result.matchedHosts).toEqual([]);
    expect(result.mismatchedHosts).toHaveLength(1);
    expect(result.mismatchedHosts[0].hostname).toBe('win01');
    expect(result.mismatchedHosts[0].reason).toContain('OS family');
    expect(result.mismatchedHosts[0].reason).toContain('OS version');
  });

  // ─── Network device match ──────────────────────────────────────────

  it('matches network device by device_type', () => {
    const spec: PlatformSpec = { device_type: ['cisco_ios'] };
    const hosts: HostFacts[] = [
      { hostname: 'switch01', device_type: 'cisco_ios' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toEqual(['switch01']);
    expect(result.mismatchedHosts).toEqual([]);
  });

  // ─── scanner_validates bypass ──────────────────────────────────────

  it('bypasses validation when scanner_validates is true', () => {
    const spec: PlatformSpec = {
      os_family: ['RedHat'],
      os_version: ['9'],
      scanner_validates: true,
    };
    const hosts: HostFacts[] = [
      { hostname: 'win01', ansible_os_family: 'Windows', ansible_distribution_major_version: '2022' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toEqual(['win01']);
    expect(result.mismatchedHosts).toEqual([]);
  });

  // ─── Empty / null spec ─────────────────────────────────────────────

  it('treats null spec as permissive (all hosts match)', () => {
    const hosts: HostFacts[] = [
      { hostname: 'any01' },
      { hostname: 'any02' },
    ];

    const result = validatePlatform(null, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toEqual(['any01', 'any02']);
    expect(result.mismatchedHosts).toEqual([]);
  });

  it('treats empty spec (no constraints) as permissive', () => {
    const spec: PlatformSpec = {};
    const hosts: HostFacts[] = [
      { hostname: 'host1', ansible_os_family: 'Debian' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toEqual(['host1']);
  });

  // ─── Mixed inventory ──────────────────────────────────────────────

  it('reports mixed inventory with 8 RHEL + 2 Windows hosts', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'], os_version: ['9'] };
    const hosts: HostFacts[] = [];

    // 8 RHEL hosts
    for (let i = 1; i <= 8; i++) {
      hosts.push({
        hostname: `rhel${String(i).padStart(2, '0')}`,
        ansible_os_family: 'RedHat',
        ansible_distribution_major_version: '9',
      });
    }

    // 2 Windows hosts
    hosts.push({
      hostname: 'win01',
      ansible_os_family: 'Windows',
      ansible_distribution_major_version: '2022',
    });
    hosts.push({
      hostname: 'win02',
      ansible_os_family: 'Windows',
      ansible_distribution_major_version: '2019',
    });

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(false);
    expect(result.matchedHosts).toHaveLength(8);
    expect(result.mismatchedHosts).toHaveLength(2);
    expect(result.mismatchedHosts[0].hostname).toBe('win01');
    expect(result.mismatchedHosts[1].hostname).toBe('win02');
  });

  // ─── Host with missing facts ──────────────────────────────────────

  it('accepts host with no facts (facts not gathered yet)', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'] };
    const hosts: HostFacts[] = [
      { hostname: 'unknown01' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toContain('unknown01');
  });

  it('rejects host with wrong facts but accepts host with no facts', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'] };
    const hosts: HostFacts[] = [
      { hostname: 'win01', ansible_os_family: 'Windows' },
      { hostname: 'new01' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(false);
    expect(result.mismatchedHosts).toHaveLength(1);
    expect(result.mismatchedHosts[0].hostname).toBe('win01');
    expect(result.matchedHosts).toContain('new01');
  });

  it('accepts host with partial matching facts', () => {
    const spec: PlatformSpec = { os_family: ['RedHat'], os_version: ['9'] };
    const hosts: HostFacts[] = [
      { hostname: 'rhel01', ansible_os_family: 'RedHat' },
    ];

    const result = validatePlatform(spec, hosts);
    expect(result.valid).toBe(true);
    expect(result.matchedHosts).toContain('rhel01');
  });
});
