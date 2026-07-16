#!/usr/bin/env bash
# Guard against silent dependency downgrades from bulk backstage-cli versions:bump.
# Add entries to PINNED_DEPS when a manual override fixes a critical bug that the
# Backstage release train doesn't carry at a high-enough version.
#
# Checks EVERY resolved version block for the package in yarn.lock, not just the
# first match — multiple coexisting ranges per package are the norm in this repo.
#
# Format: "package minimum_major.minor.patch reason"
PINNED_DEPS=(
  "@backstage/plugin-catalog-backend 3.6.0 AAP-73301:getProcessableEntities-deadlock"
)

rc=0
for entry in "${PINNED_DEPS[@]}"; do
  read -r pkg min_ver reason <<< "$entry"

  mapfile -t versions < <(grep -A1 "\"${pkg}@npm:" yarn.lock \
    | grep 'version:' \
    | sed 's/.*version: //')

  if [ ${#versions[@]} -eq 0 ]; then
    echo "FAIL: ${pkg} not found in yarn.lock"
    rc=1
    continue
  fi

  for resolved in "${versions[@]}"; do
    lowest=$(printf '%s\n%s\n' "$min_ver" "$resolved" | sort -V | head -1)
    if [ "$lowest" != "$min_ver" ]; then
      echo "FAIL: ${pkg} resolved to ${resolved}, minimum required is ${min_ver} (${reason})"
      rc=1
    else
      echo "OK: ${pkg}@${resolved} >= ${min_ver} (${reason})"
    fi
  done
done

exit $rc
