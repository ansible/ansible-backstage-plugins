#!/bin/bash

set -e
set -u

# Save the parent directory path (repository root)
PARENT_DIR="$(pwd)"

# Variables
pluginsDir="plugins"
packDestination="$PARENT_DIR/dynamic-plugins-archives"
finalPackDir="$PARENT_DIR/ansible-plugins-pack"
sourcePackDir="$PARENT_DIR/ansible-rhdh-plugins-source-code"

# Early-access mode (set by workflow)
RELEASE_TYPE="${RELEASE_TYPE:-standard}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-}"
BUILD_TIMESTAMP="${BUILD_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%S)}"

OCI_REGISTRY_NAMESPACE=${OCI_REGISTRY_NAMESPACE:-quay.io/ansible/ansible-rhdh-plugins}
OCI_IMAGE_PUSH=${OCI_IMAGE_PUSH:-false}
echo OCI_IMAGE_PUSH="$OCI_IMAGE_PUSH"
echo OCI_REGISTRY_NAMESPACE="$OCI_REGISTRY_NAMESPACE"
echo RELEASE_TYPE="$RELEASE_TYPE"

if [ "$RELEASE_TYPE" = "early-access" ] && [ -n "$UPSTREAM_BRANCH" ]; then
    BRANCH_SLUG=$(echo "$UPSTREAM_BRANCH" | sed 's|[^a-zA-Z0-9]|-|g')
    SHA=$(git rev-parse --short HEAD)
    VERSION="${BRANCH_SLUG}-${SHA}-${BUILD_TIMESTAMP}"
elif [ -z "${GITHUB_REF:-}" ]; then
    VERSION=$(git rev-parse --short HEAD)
else
    VERSION="$GITHUB_REF"
    VERSION=${VERSION##*/v}  # for tags
    VERSION=${VERSION##*/}  # for branches/PRs/local-testing
fi
echo VERSION="$VERSION"

# Check if the plugins directory exists
if [ ! -d "$pluginsDir" ]; then
  echo "The directory $pluginsDir does not exist."
  exit 1
fi

# Create a tarball named pack.tar.gz
echo "Creating a tarball of the current directory as pack.tar.gz..."
git archive HEAD -o pack.tar.gz
echo "Tarball pack.tar.gz created."

# Extract the tarball into a directory called ansible-rhdh-plugins-source-code-$VERSION
echo "Creating directory $sourcePackDir-$VERSION and extracting pack.tar.gz into it..."
mkdir $sourcePackDir-$VERSION && tar -xzf pack.tar.gz -C $sourcePackDir-$VERSION/
echo "Extraction complete. Contents now in $sourcePackDir-$VERSION."

# Repack the directory with the desired name ansible-rhdh-plugins-source-code-$VERSION.tar.gz
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
self_service_plugins=(
  "auth-backend-module-rhaap-provider"
  "catalog-backend-module-rhaap"
  "self-service"
  "scaffolder-backend-module-backstage-rhaap"
  "backstage-apme"
  "catalog-backend-module-apme"
)

# Create separate directories for each bundle
rhdh_pack_dir="$PARENT_DIR/rhdh-plugins-archives"
self_service_pack_dir="$PARENT_DIR/self-service-plugins-archives"
mkdir -p "$rhdh_pack_dir" "$self_service_pack_dir"

yarn install
yarn tsc

# Build all *-common packages first (dependencies for other plugins)
for commonDir in "$pluginsDir"/*-common; do
  if [ -d "$commonDir" ]; then
    commonName=$(basename "$commonDir")
    echo "Building $commonName (required by other plugins)..."
    pushd "$commonDir" > /dev/null
    yarn build
    popd > /dev/null
    echo "$commonName built successfully"
  fi
done

if [ "$RELEASE_TYPE" = "early-access" ]; then
  # ── Early-access: single bundle with all plugins ──
  mkdir -p "$finalPackDir"
  packed_plugins=()

  for pluginDir in "$pluginsDir"/*; do
    if [ -d "$pluginDir" ]; then
      pluginName=$(basename "$pluginDir")
      [[ "$pluginName" == *-common ]] && continue
      [ "$pluginName" == "backstage-rhaap" ] && continue
      if ! grep -q '"export-dynamic"' "$pluginDir/package.json" 2>/dev/null; then
        echo "Skipping $pluginName (no export-dynamic script)"
        continue
      fi
      "$PARENT_DIR/.github/actions/pack/pack_one.sh" "$pluginDir" "$packDestination"
      packed_plugins+=("$pluginName")
    fi
  done

  if [ "${#packed_plugins[@]}" -eq 0 ]; then
    echo "No plugins were packed."
    exit 1
  fi
  echo "Packed plugins: ${packed_plugins[*]}"

  # Source snapshot
  source_files=""
  for plugin in "${packed_plugins[@]}"; do
    if [ -d "plugins/$plugin/src" ]; then
      source_files="$source_files plugins/$plugin/src plugins/$plugin/package.json"
      [ -f "plugins/$plugin/README.md" ] && source_files="$source_files plugins/$plugin/README.md"
      [ -f "plugins/$plugin/config.d.ts" ] && source_files="$source_files plugins/$plugin/config.d.ts"
    fi
  done
  if [ -n "$source_files" ]; then
    # shellcheck disable=SC2086
    tar -czvf "early-access-plugins-source-code-${VERSION}.tar.gz" $source_files 2>/dev/null || true
    mv "early-access-plugins-source-code-${VERSION}.tar.gz" "$packDestination/"
  fi

  # Single bundle tarball (no loose file copy — bundle contains everything)
  bundle="early-access-plugins-${VERSION}.tar.gz"
  tar -czvf "$bundle" -C "$packDestination" .
  mv "$bundle" "$finalPackDir/"
  rm -rf "$packDestination"

  echo "Early-access bundle created: $finalPackDir/$bundle"
  echo "Contents:"
  ls -la "$finalPackDir"

else
  # ── Standard: two-bundle split ──

  # Loop through each subdirectory in the ./plugins directory
  for pluginDir in "$pluginsDir"/*; do
    if [ -d "$pluginDir" ]; then
      pluginName=$(basename "$pluginDir")
      [[ "$pluginName" == *-common ]] && continue

      # Pack the plugin
      "$PARENT_DIR/.github/actions/pack/pack_one.sh" "$pluginDir" "$packDestination"

      # Copy the packed plugin to appropriate directories
      if [[ " ${rhdh_plugins[*]} " == *" ${pluginName} "* ]]; then
        cp "$packDestination"/*"$pluginName"* "$rhdh_pack_dir/" 2>/dev/null || true
      fi
      if [[ " ${self_service_plugins[*]} " == *" ${pluginName} "* ]]; then
        cp "$packDestination"/*"$pluginName"* "$self_service_pack_dir/" 2>/dev/null || true
      fi
      find "$packDestination" -name "*$pluginName*" -delete 2>/dev/null || true
    fi
  done

  echo "Completed processing all plugin directories."

  # Create the final pack directory if it doesn't exist
  mkdir -p "$finalPackDir"

  # Create plugin-specific source code tarballs
  echo "Creating plugin-specific source code tarballs..."

  rhdh_source_files=""
  for plugin in "${rhdh_plugins[@]}"; do
    if [ -d "plugins/$plugin/src" ]; then
      rhdh_source_files="$rhdh_source_files plugins/$plugin/src plugins/$plugin/package.json plugins/$plugin/README.md plugins/$plugin/config.d.ts"
    fi
  done

  if [ -n "$rhdh_source_files" ]; then
    rhdh_source_tarball="ansible-rhdh-plugins-source-code-$VERSION.tar.gz"
    # shellcheck disable=SC2086
    tar -czvf "$rhdh_source_tarball" $rhdh_source_files 2>/dev/null || true
    mv "$rhdh_source_tarball" "$rhdh_pack_dir/"
    echo "Created RHDH plugins source code tarball with source directories only"
  fi

  self_service_source_files=""
  for plugin in "${self_service_plugins[@]}"; do
    if [ -d "plugins/$plugin/src" ]; then
      self_service_source_files="$self_service_source_files plugins/$plugin/src plugins/$plugin/package.json plugins/$plugin/README.md plugins/$plugin/config.d.ts"
    fi
  done

  if [ -n "$self_service_source_files" ]; then
    self_service_source_tarball="self-service-automation-portal-plugins-source-code-$VERSION.tar.gz"
    # shellcheck disable=SC2086
    tar -czvf "$self_service_source_tarball" $self_service_source_files 2>/dev/null || true
    mv "$self_service_source_tarball" "$self_service_pack_dir/"
    echo "Created self-service plugins source code tarball with source directories only"
  fi

  rhdh_tarball_name="ansible-rhdh-plugins-$VERSION.tar.gz"
  tar -czvf "$rhdh_tarball_name" -C "$rhdh_pack_dir" .
  mv "$rhdh_tarball_name" "$finalPackDir"

  self_service_tarball_name="self-service-automation-portal-plugins-$VERSION.tar.gz"
  tar -czvf "$self_service_tarball_name" -C "$self_service_pack_dir" .
  mv "$self_service_tarball_name" "$finalPackDir"

  cp -r "$rhdh_pack_dir/." "$finalPackDir/"
  cp -r "$self_service_pack_dir/." "$finalPackDir/"

  rm -rf "$packDestination" "$rhdh_pack_dir" "$self_service_pack_dir"

  echo "Two tarballs created and moved to $finalPackDir:"
  echo "  - ansible-rhdh-plugins-$VERSION.tar.gz (contains backstage-rhaap and scaffolder-backend-module plugins + their source code)"
  echo "  - self-service-automation-portal-plugins-$VERSION.tar.gz (contains auth-backend-module, catalog-backend-module, self-service, scaffolder-backend-module, apme plugins + their source code)"
  echo "Contents of both plugin archives copied to $finalPackDir"
fi
