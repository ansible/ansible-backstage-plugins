#!/usr/bin/env bash

set -u

log_file="${TEST_CONSOLE_LOG:-test-console.log}"
: > "$log_file"

if [ -n "${CI:-}" ] && [ "${CI}" != "false" ]; then
  worker_args=()
else
  worker_args=(--maxWorkers=50%)
fi

# An explicit Jest worker limit takes precedence over the local default.
for arg in "$@"; do
  case "$arg" in
    --maxWorkers|--maxWorkers=*|-w|-w=*|--runInBand|-i) worker_args=(); break ;;
  esac
done

NODE_OPTIONS="${NODE_OPTIONS:-} --experimental-vm-modules" \
  backstage-cli repo test --watch=false "${worker_args[@]}" "$@" \
  2> "$log_file"
status=$?

# Keep console.warn/console.error output out of the terminal. The command
# status still comes from Jest, so CI fails normally when tests fail.
if [ "$status" -ne 0 ]; then
  {
    echo ""
    echo "======== jest failed (exit ${status}) ========"
    if grep -qE 'FAIL .+\.test\.' "$log_file" 2>/dev/null; then
      echo "Failed suites:"
      grep -E 'FAIL .+\.test\.' "$log_file" | sed 's/.*FAIL //' | sort -u
      echo ""
      echo "Failing tests (first 25):"
      grep '● ' "$log_file" | head -25
    else
      echo "No FAIL lines in log; showing last 40 lines of stderr:"
      tail -40 "$log_file"
    fi
    suites_line=$(grep '^Test Suites:' "$log_file" 2>/dev/null | tail -1)
    tests_line=$(grep '^Tests:' "$log_file" 2>/dev/null | tail -1)
    if [ -n "$suites_line" ]; then
      echo ""
      echo "$suites_line"
      [ -n "$tests_line" ] && echo "$tests_line"
    fi
    if grep -qE 'better[-_]sqlite3|NODE_MODULE_VERSION' "$log_file" 2>/dev/null; then
      echo ""
      echo "Hint: better-sqlite3 was built for a different Node than $(node -v 2>/dev/null || echo 'current')."
      echo "  nvm use 22    # repo engines: 22 || 24 — pick one and stay on it"
      echo "  npm rebuild better-sqlite3"
      echo "  # or run yarn install again after switching Node"
    fi
  } >&2
fi

exit "$status"
