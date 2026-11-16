import { JsonValue } from '@backstage/types';

export const resourceFilter = (...args: JsonValue[]) => {
  if (!args?.length) {
    return null;
  }
  const key = args[1] ?? 'id';
  // @ts-ignore
  const value = args[0]?.[key];
  // @ts-ignore
  if (args.length && value !== null && value !== undefined) {
    return value;
  }
  return null;
};

export const multiResourceFilter = (...args: JsonValue[]) => {
  if (!args?.length) {
    return null;
  }
  const key = args[1] ?? 'id';
  // @ts-ignore
  if (args.length && Array.isArray(args[0])) {
    // @ts-ignore
    return args[0].map(item => item?.[key]);
  }
  return null;
};
