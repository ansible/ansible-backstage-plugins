#!/usr/bin/env bash
# Guard against silent dependency downgrades from bulk backstage-cli versions:bump.
# Add entries to PINNED_DEPS when a manual override fixes a critical bug that the
# Backstage release train doesn't carry at a high-enough version.
#
# For each entry, finds every package.json that declares the dependency, reads the
# declared range, then checks the exact resolution for that range in yarn.lock.
# This avoids false-OKs from unrelated transitive ranges that happen to resolve
# above the minimum while the guarded packages resolve below it.
#
# Format: "package minimum_major.minor.patch reason"
PINNED_DEPS=(
  "@backstage/plugin-catalog-backend 3.6.0 AAP-73301:getProcessableEntities-deadlock"
)

rc=0
for entry in "${PINNED_DEPS[@]}"; do
  read -r pkg min_ver reason <<< "$entry"
  found=0

  while IFS= read -r pkg_json; do
    range=$(python3 -c "
import json, sys
with open('$pkg_json') as f:
    deps = json.load(f).get('dependencies', {})
v = deps.get('$pkg')
if v:
    print(v)
" 2>/dev/null)

    [ -z "$range" ] && continue
    found=1

    resolved=$(grep -A1 "\"${pkg}@npm:${range}\":" yarn.lock \
      | grep 'version:' \
      | sed 's/.*version: //')

    if [ -z "$resolved" ]; then
      echo "FAIL: ${pkg}@${range} (from ${pkg_json}) not found in yarn.lock"
      rc=1
      continue
    fi

    lowest=$(printf '%s\n%s\n' "$min_ver" "$resolved" | sort -V | head -1)
    if [ "$lowest" != "$min_ver" ]; then
      echo "FAIL: ${pkg_json}: ${pkg} range ${range} resolves to ${resolved}, minimum required is ${min_ver} (${reason})"
      rc=1
    else
      echo "OK: ${pkg_json}: ${pkg}@${resolved} >= ${min_ver} (${reason})"
    fi
  done < <(find packages plugins -name package.json -not -path '*/node_modules/*' 2>/dev/null)

  if [ "$found" -eq 0 ]; then
    echo "FAIL: ${pkg} not found in any package.json"
    rc=1
  fi
done

exit $rc
