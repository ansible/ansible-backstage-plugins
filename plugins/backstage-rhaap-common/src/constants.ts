export const SCM_INTEGRATION_AUTH_FAILED_CODE = 'INTEGRATION_AUTH_FAILED';

export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(p => Number.parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map(p => Number.parseInt(p, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

export const TERMINAL_JOB_STATUSES = new Set([
  'successful',
  'failed',
  'error',
  'canceled',
]);

const data = [
  '0 (Normal)',
  '1 (Verbose)',
  '2 (More Verbose)',
  '3 (Debug)',
  '4 (Connection Debug)',
  '5 (WinRM Debug)',
];

export const getVerbosityObject = (level: number) => {
  return { id: level, name: data[level] };
};

export const getVerbosityLevels = () => {
  return data.map((value, index) => {
    return { id: index, name: value };
  });
};
