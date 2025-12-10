#!/bin/bash

set -e
set -u

# Variables
pluginsDir="plugins"
packDestination="dynamic-plugins-archives"
finalPackDir="ansible-plugins-pack"
sourcePackDir="ansible-backstage-plugins-source-code"

OCI_REGISTRY_NAMESPACE=${OCI_REGISTRY_NAMESPACE:-quay.io/ansible/ansible-backstage-plugins}
OCI_IMAGE_PUSH=${OCI_IMAGE_PUSH:-false}
echo OCI_IMAGE_PUSH="$OCI_IMAGE_PUSH"
echo OCI_REGISTRY_NAMESPACE="$OCI_REGISTRY_NAMESPACE"

if [ -z "${GITHUB_REF:-}" ]; then
    VERSION=$(git rev-parse --short HEAD)
else
    VERSION="$GITHUB_REF"
    VERSION=${VERSION##*/v}  # for tags
    VERSION=${VERSION##*/}  # for branches/PRs/local-testing
fi

# Check if the plugins directory exists
if [ ! -d "$pluginsDir" ]; then
  echo "The directory $pluginsDir does not exist."
  exit 1
fi

# Create a tarball named pack.tar.gz
echo "Creating a tarball of the current directory as pack.tar.gz..."
git archive HEAD -o pack.tar.gz
echo "Tarball pack.tar.gz created."

# Extract the tarball into a directory called ansible-backstage-plugins-source-code-$VERSION
echo "Creating directory $sourcePackDir-$VERSION and extracting pack.tar.gz into it..."
mkdir $sourcePackDir-$VERSION && tar -xzf pack.tar.gz -C $sourcePackDir-$VERSION/
echo "Extraction complete. Contents now in $sourcePackDir-$VERSION."

# Repack the directory with the desired name ansible-backstage-plugins-source-code-$VERSION.tar.gz
echo "Repacking the directory $sourcePackDir-$VERSION into a new tarball ${sourcePackDir}-$VERSION.tar.gz..."
tar -czvf $sourcePackDir-$VERSION.tar.gz -C $(dirname $sourcePackDir-$VERSION) $(basename $sourcePackDir-$VERSION)
echo "Tarball ${sourcePackDir}-$VERSION.tar.gz created."

# Clean up the original pack.tar.gz and the extracted directory
echo "Cleaning up: Removing pack.tar.gz and the directory $sourcePackDir-$VERSION..."
rm -rf pack.tar.gz $sourcePackDir-$VERSION
echo "Cleanup complete."

# End processing source tar

# Create the pack destination directory
mkdir -p "$packDestination"

# Move source code tar to the pack destination directory
mv $sourcePackDir-$VERSION.tar.gz "$packDestination"

# Define plugin categories
rhdh_plugins=("backstage-rhaap" "scaffolder-backend-module-backstage-rhaap")
self_service_plugins=("auth-backend-module-rhaap-provider" "catalog-backend-module-rhaap" "self-service" "scaffolder-backend-module-backstage-rhaap")

# Create separate directories for each bundle
rhdh_pack_dir="rhdh-plugins-archives"
self_service_pack_dir="self-service-plugins-archives"
mkdir -p "$rhdh_pack_dir" "$self_service_pack_dir"

# Loop through each subdirectory in the ./plugins directory
for pluginDir in "$pluginsDir"/*; do
  if [ -d "$pluginDir" ]; then
    pluginName=$(basename "$pluginDir")
    if [ "$pluginName" == "backstage-rhaap-common" ]; then
      continue
    fi
    
    # Pack the plugin
    .github/actions/pack/pack_one.sh "$pluginDir"
    
    # Copy the packed plugin to appropriate directories
    if [[ " ${rhdh_plugins[*]} " == *" ${pluginName} "* ]]; then
      # Copy only this plugin's files to RHDH plugins directory
      cp "$packDestination"/*"$pluginName"* "$rhdh_pack_dir/" 2>/dev/null || true
    fi
    if [[ " ${self_service_plugins[*]} " == *" ${pluginName} "* ]]; then
      # Copy only this plugin's files to self-service plugins directory
      cp "$packDestination"/*"$pluginName"* "$self_service_pack_dir/" 2>/dev/null || true
    fi
    # Clean up the temporary plugin files in packDestination after copying (but preserve source code)
    find "$packDestination" -name "*$pluginName*" -delete 2>/dev/null || true
  fi
done

echo "Completed processing all plugin directories."

# Create the final pack directory if it doesn't exist
mkdir -p "$finalPackDir"

# Create plugin-specific source code tarballs
echo "Creating plugin-specific source code tarballs..."

# Create RHDH plugins source code tarball
rhdh_source_files=""
for plugin in "${rhdh_plugins[@]}"; do
  if [ -d "plugins/$plugin/src" ]; then
    rhdh_source_files="$rhdh_source_files plugins/$plugin/src plugins/$plugin/package.json plugins/$plugin/README.md plugins/$plugin/config.d.ts"
  fi
done

if [ -n "$rhdh_source_files" ]; then
  rhdh_source_tarball="ansible-rhdh-plugins-source-code-$VERSION.tar.gz"
  tar -czvf "$rhdh_source_tarball" $rhdh_source_files 2>/dev/null || true
  mv "$rhdh_source_tarball" "$rhdh_pack_dir/"
  echo "Created RHDH plugins source code tarball with source directories only"
fi

# Create self-service plugins source code tarball
self_service_source_files=""
for plugin in "${self_service_plugins[@]}"; do
  if [ -d "plugins/$plugin/src" ]; then
    self_service_source_files="$self_service_source_files plugins/$plugin/src plugins/$plugin/package.json plugins/$plugin/README.md plugins/$plugin/config.d.ts"
  fi
done

if [ -n "$self_service_source_files" ]; then
  self_service_source_tarball="self-service-automation-portal-plugins-source-code-$VERSION.tar.gz"
  tar -czvf "$self_service_source_tarball" $self_service_source_files 2>/dev/null || true
  mv "$self_service_source_tarball" "$self_service_pack_dir/"
  echo "Created self-service plugins source code tarball with source directories only"
fi

# Create RHDH plugins tarball
rhdh_tarball_name="ansible-rhdh-plugins-$VERSION.tar.gz"
tar -czvf "$rhdh_tarball_name" -C "$rhdh_pack_dir" .
mv "$rhdh_tarball_name" "$finalPackDir"

# Create self-service automation portal plugins tarball
self_service_tarball_name="self-service-automation-portal-plugins-$VERSION.tar.gz"
tar -czvf "$self_service_tarball_name" -C "$self_service_pack_dir" .
mv "$self_service_tarball_name" "$finalPackDir"

# Copy the content of both directories to ansible-plugins-pack
cp -r "$rhdh_pack_dir/." "$finalPackDir/"
cp -r "$self_service_pack_dir/." "$finalPackDir/"

# Delete the temporary directories
rm -rf "$packDestination" "$rhdh_pack_dir" "$self_service_pack_dir"

echo "Two tarballs created and moved to $finalPackDir:"
echo "  - ansible-rhdh-plugins-$VERSION.tar.gz (contains backstage-rhaap and scaffolder-backend-module plugins + their source code)"
echo "  - self-service-automation-portal-plugins-$VERSION.tar.gz (contains auth-backend-module, catalog-backend-module, self-service, and scaffolder-backend-module plugins + their source code)"
echo "Contents of both plugin archives copied to $finalPackDir"
echo "Deleted temporary directories"
