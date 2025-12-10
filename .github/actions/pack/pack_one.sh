#!/bin/bash

set -e
set -u

pluginDir="$1"

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

mkdir -p dynamic-plugins-archives

echo "Processing $pluginDir..."

# Change to the plugin directory
pushd "$pluginDir" > /dev/null

# Compute params
PLUGIN_NAME=$(< package.json jq -r '.name' | sed -e 's/@//' -e 's|/|-|')
PLUGIN_VERSION=$(< package.json jq -r '.version' | sed -e 's/@//' -e 's|/|-|')
OCI_REGISTRY_NAMESPACE=${OCI_REGISTRY_NAMESPACE:-quay.io/example}
OCI_IMAGE_NAME=$OCI_REGISTRY_NAMESPACE/$PLUGIN_NAME:v$PLUGIN_VERSION
OCI_IMAGE_PUSH=${OCI_IMAGE_PUSH:-false}
echo OCI_IMAGE_PUSH="$OCI_IMAGE_PUSH"

# Run the build/export/pack commands
run_cmd yarn install
run_cmd npx tsc
run_cmd yarn build
run_cmd yarn export-dynamic

echo "Running npm pack in $pluginDir"
cd dist-dynamic
pack_json=$(npm pack --pack-destination ../../../dynamic-plugins-archives --json)
echo "Integrity Hash: $pack_json"
if [ $? -ne 0 ]; then
  echo "npm pack failed in $pluginDir"
  popd > /dev/null
  exit 1
fi

echo "Creating package.integrity file"
filename=$(echo "$pack_json" | jq -r '.[0].filename')
integrity=$(echo "$pack_json" | jq -r '.[0].integrity')
echo "$integrity" > ../../../dynamic-plugins-archives/"${filename}".integrity

# build also OCI image
# @janus-idp/cli@1.18.1 and later fail with 'TypeError: Cannot read properties of undefined (reading 'packages')'
# Use 1.18.0 until this gets fixed.
run_cmd npx @janus-idp/cli@1.18.0 package package-dynamic-plugins --tag "$OCI_IMAGE_NAME"
if [ "$OCI_IMAGE_PUSH" == "true" ]; then
  run_cmd_description "podman push --creds '********' $OCI_IMAGE_NAME" podman push --creds "$OCI_REGISTRY_USERNAME:$OCI_REGISTRY_PASSWORD" "$OCI_IMAGE_NAME"
else
  echo "Not pushing the OCI image $OCI_IMAGE_NAME"
fi
# Return to the original directory
popd > /dev/null
