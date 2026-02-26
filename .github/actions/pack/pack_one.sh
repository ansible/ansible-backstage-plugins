#!/bin/bash

set -e
set -u

pluginDir="$1"
packDestination="${2:-dynamic-plugins-archives}"

function run_cmd_description {
  # Show custom message instead of command.
  # Use to hide password.
  cmd_description="$1"
  shift
  cmd="$@"
  echo "Running $cmd_description in $pluginDir"

  if ! $cmd; then
    echo "$cmd_description failed in $pluginDir"
    popd > /dev/null
    exit 1
  fi
}

function run_cmd {
  # Show command, then run it.
  # Exit if command fails.
  cmd="$@"
  run_cmd_description "$cmd" $cmd
}

mkdir -p "$packDestination"

echo "Processing $pluginDir..."

# Change to the plugin directory
pushd "$pluginDir" > /dev/null

# Run the build/export/pack commands
run_cmd yarn install
run_cmd yarn build
run_cmd yarn export-dynamic

echo "Running npm pack in $pluginDir"
cd dist-dynamic
pack_json=$(npm pack --pack-destination "$packDestination" --json)
echo "Integrity Hash: $pack_json"
if [ $? -ne 0 ]; then
  echo "npm pack failed in $pluginDir"
  popd > /dev/null
  exit 1
fi

echo "Creating package.integrity file"
filename=$(echo "$pack_json" | jq -r '.[0].filename')
integrity=$(echo "$pack_json" | jq -r '.[0].integrity')
echo "$integrity" > "$packDestination/${filename}.integrity"

# Return to the original directory
popd > /dev/null