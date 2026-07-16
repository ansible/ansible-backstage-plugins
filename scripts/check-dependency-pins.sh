#!/usr/bin/env bash
# Guard against silent dependency downgrades from bulk backstage-cli versions:bump.
# Add entries to PINNED_DEPS when a manual override fixes a critical bug that the
# Backstage release train doesn't carry at a high-enough version.
#
# Format: "package minimum_major.minor.patch reason"
PINNED_DEPS=(
  "@backstage/plugin-catalog-backend 3.6.0 AAP-73301:getProcessableEntities-deadlock"
)

rc=0
for entry in "${PINNED_DEPS[@]}"; do
  read -r pkg min_ver reason <<< "$entry"

  resolved=$(grep -A1 "\"${pkg}@npm:" yarn.lock \
    | grep 'version:' \
    | head -1 \
    | sed 's/.*version: //')

  if [ -z "$resolved" ]; then
    echo "FAIL: ${pkg} not found in yarn.lock"
    rc=1
    continue
  fi

  lowest=$(printf '%s\n%s\n' "$min_ver" "$resolved" | sort -V | head -1)
  if [ "$lowest" != "$min_ver" ]; then
    echo "FAIL: ${pkg} resolved to ${resolved}, minimum required is ${min_ver} (${reason})"
    rc=1
  else
    echo "OK: ${pkg}@${resolved} >= ${min_ver} (${reason})"
  fi
done

exit $rc
