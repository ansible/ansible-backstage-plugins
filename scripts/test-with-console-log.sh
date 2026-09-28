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
exit "$status"
