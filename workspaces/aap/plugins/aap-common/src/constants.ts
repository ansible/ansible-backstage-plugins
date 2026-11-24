/** @deprecated Import the shared version helper from @ansible/portal-extension-common. */
export { compareVersions } from '@ansible/portal-extension-common';

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
