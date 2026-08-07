/*
 * Copyright Red Hat
 */

/**
 * Whether Push must run a fresh remedia for `targetIds` before submit.
 *
 * Gateway submit is activity-scoped (all patches on that remedia activity), not
 * selection-scoped. Reusing a cached activity / tier1 result when the selection
 * differs can push far more findings than the user selected (e.g. 92 vs 2).
 *
 * Skip remedia only when we already generated fixes for exactly this selection
 * and still have that activity id.
 */
export function mustRemediateBeforePush(args: {
  targetIds: ReadonlySet<number>;
  generatedIds: ReadonlySet<number>;
  activityId: string | null | undefined;
}): boolean {
  const { targetIds, generatedIds, activityId } = args;
  if (!activityId || targetIds.size === 0) {
    return true;
  }
  if (generatedIds.size !== targetIds.size) {
    return true;
  }
  for (const id of targetIds) {
    if (!generatedIds.has(id)) {
      return true;
    }
  }
  return false;
}
