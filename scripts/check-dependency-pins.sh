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
    range=$(node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const range = manifest.dependencies?.[process.argv[2]];
if (range) console.log(range);
' "$pkg_json" "$pkg") || exit 1

    [ -z "$range" ] && continue
    found=1

    # Yarn can group several exact descriptors under one quoted key. Match
    # descriptor membership, not a regex substring or just the final range.
    resolved=$(awk -v descriptor="${pkg}@npm:${range}" '
      /^".*":$/ {
        key = substr($0, 2, length($0) - 3)
        count = split(key, descriptors, ", ")
        matches = 0
        for (i = 1; i <= count; i++) {
          if (descriptors[i] == descriptor) matches = 1
        }
      }
      matches && /^  version: / {
        version = $2
        gsub(/"/, "", version)
        print version
        exit
      }
    ' yarn.lock)

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
  done < <(find workspaces e2e-tests \
    -type d \( -name node_modules -o -name dist -o -name dist-dynamic -o -name .git \) -prune \
    -o -type f -name package.json -print 2>/dev/null)

  if [ "$found" -eq 0 ]; then
    echo "FAIL: ${pkg} not found in any package.json"
    rc=1
  fi
done

exit $rc
