import { JsonValue } from '@backstage/types';

export const useCaseNameFilter = (...args: JsonValue[]) => {
  if (!args?.length) {
    return [];
  }
  if (args.length && Array.isArray(args[0])) {
    // @ts-ignore
    return args[0].map(a => (a?.name ? a.name : ''));
  }
  return [];
};
