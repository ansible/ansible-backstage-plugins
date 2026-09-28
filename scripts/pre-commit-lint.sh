#!/usr/bin/env sh
# Pre-commit lint: Backstage workspace packages + e2e TypeScript when staged.
set -e

root="$(git rev-parse --show-toplevel)"
cd "$root"

yarn backstage-cli repo lint --fix

staged_e2e="$(
  git diff --cached --name-only --diff-filter=ACM |
    grep -E '^e2e-tests/.*\.(ts|tsx)$' || true
)"

if [ -n "$staged_e2e" ]; then
  yarn --cwd e2e-tests exec tsc --noEmit
fi
