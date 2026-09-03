#!/bin/bash
set -euo pipefail
YARN_CMD="yarn"

# Optimize build performance
export NODE_OPTIONS="--max-old-space-size=16384"
PARENT_DIR="$(pwd)"

# Function to fix absolute symlinks in exported plugins
fix_plugin_symlinks() {
  echo "Fixing symlinks in exported plugin node_modules..."
  find "${PARENT_DIR}/dynamic-plugins" -path "*/node_modules/.bin/*" -type l 2>/dev/null | while read -r symlink; do
    if [ -L "$symlink" ]; then
      target=$(readlink "$symlink")
      # If symlink is absolute (starts with /), try to replace with actual file
      if [[ "$target" = /* ]]; then
        # Extract the package name and file path from the target
        # Example: /var/workdir/source/.../node_modules/yaml/bin.mjs -> yaml/bin.mjs
        # Use greedy match (.*) to get the LAST occurrence of node_modules/
        if [[ "$target" =~ .*node_modules/([^/]+/.+)$ ]]; then
          relative_path="${BASH_REMATCH[1]}"
          # Find this file in the exported plugin's node_modules
          # symlink is at: .../plugin-name/node_modules/.bin/yaml
          # We need: .../plugin-name/node_modules/yaml/bin.mjs
          plugin_dir=$(dirname $(dirname $(dirname "$symlink")))
          actual_file="$plugin_dir/node_modules/$relative_path"

          if [ -f "$actual_file" ]; then
            rm "$symlink"
            cp "$actual_file" "$symlink"
            chmod +x "$symlink"
            echo "  Fixed: $symlink"
          else
            echo "  Warning: Could not fix symlink $symlink -> $target (file not found: $actual_file)"
          fi
        else
          echo "  Warning: Could not parse target path: $target"
        fi
      fi
    fi
  done || true
}

# Fix exported plugins whose yarn install failed during rhdh-cli export.
# @backstage/cli 0.36.2 copies the monorepo yarn.lock (with workspace:
# references) instead of generating a standalone one for plugins with complex
# dependency trees.  The workspace: references are invalid standalone, so
# yarn install fails and node_modules/ is never created — embedded packages
# (e.g. @ansible/backstage-rhaap-common) cannot be resolved at runtime.
# In hermetic (no-network) builds like Konflux, yarn install cannot reach the
# registry at all, so we copy the embedded packages directly into node_modules.
# See https://redhat.atlassian.net/browse/AAP-83779
fix_plugin_yarn_locks() {
  echo "Checking exported plugins for dependency issues..."
  for plugin_dir in "${PARENT_DIR}"/dynamic-plugins/*/; do
    plugin_name=$(basename "$plugin_dir")

    # Only process plugins that have embedded packages
    [ -d "$plugin_dir/embedded" ] || continue

    # Remove broken yarn.lock with workspace: references
    if [ -f "$plugin_dir/yarn.lock" ] && grep -q 'workspace:' "$plugin_dir/yarn.lock"; then
      echo "  Removing broken yarn.lock from $plugin_name"
      rm "$plugin_dir/yarn.lock"
    fi

    # Ensure each embedded package is installed in node_modules
    for embedded_pkg in "$plugin_dir"/embedded/*/; do
      [ -f "${embedded_pkg}package.json" ] || continue
      pkg_name=$(node -p "require(process.argv[1]).name" "${embedded_pkg}package.json")
      if [ ! -d "$plugin_dir/node_modules/$pkg_name" ]; then
        scope=$(echo "$pkg_name" | grep -o '^@[^/]*' || true)
        [ -n "$scope" ] && mkdir -p "$plugin_dir/node_modules/$scope"
        cp -r "$embedded_pkg" "$plugin_dir/node_modules/$pkg_name"
        echo "  Installed embedded package $pkg_name into $plugin_name"
      fi

      # Copy runtime dependencies of the embedded package from monorepo node_modules
      if [ -f "$plugin_dir/node_modules/$pkg_name/package.json" ]; then
        deps=$(node -p "Object.keys(require(process.argv[1]).dependencies || {}).join('\\n')" \
          "$plugin_dir/node_modules/$pkg_name/package.json")
        for dep in $deps; do
          if [ ! -d "$plugin_dir/node_modules/$dep" ] && [ -d "node_modules/$dep" ]; then
            dep_scope=$(echo "$dep" | grep -o '^@[^/]*' || true)
            [ -n "$dep_scope" ] && mkdir -p "$plugin_dir/node_modules/$dep_scope"
            cp -r "node_modules/$dep" "$plugin_dir/node_modules/$dep"
            echo "    Installed dependency $dep for $pkg_name"
          fi
        done
      fi
    done
  done
}

$YARN_CMD install --immutable --mode=skip-build || {
    echo "Yarn install failed, but continuing with available packages..."
    echo "This may be due to native package build failures in hermetic environment"
}

echo "Running tsc"
$YARN_CMD tsc
echo "tsc completed successfully"

# Build all plugins
echo "Building all plugins"
$YARN_CMD build

RHDH_CLI="./node_modules/.bin/rhdh-cli"
export PATH="$(pwd)/node_modules/.bin:$PATH"

# Handle different build types based on environment variables
if [ "${BUILD_TYPE:-}" = "portal" ]; then
  echo "Building for Portal automation - excluding backstage-rhaap plugin"

  # Remove backstage-rhaap plugin for portal builds
  if [ -d "plugins/backstage-rhaap" ]; then
    rm -rf plugins/backstage-rhaap
  fi

  # Export dynamic plugins for Portal automation
  $RHDH_CLI plugin package --export-to "${PARENT_DIR}/dynamic-plugins"

  # Fix symlinks in exported plugins
  fix_plugin_symlinks
  fix_plugin_yarn_locks

elif [ "${BUILD_TYPE:-}" = "rhdh" ]; then
  echo "Building for RHDH - including only backstage-rhaap and scaffolder-backend-module-backstage-rhaap"

  # Remove all plugins except the RHDH ones
  for plugin_dir in plugins/*/; do
    plugin_name=$(basename "$plugin_dir")
    if [ "$plugin_name" != "backstage-rhaap" ] && [ "$plugin_name" != "scaffolder-backend-module-backstage-rhaap" ]; then
      if [ -d "$plugin_dir" ]; then
        rm -rf "$plugin_dir"
      fi
    fi
  done

  # Export only RHDH plugins
  $RHDH_CLI plugin package --export-to "${PARENT_DIR}/dynamic-plugins"

  # Fix symlinks in exported plugins
  fix_plugin_symlinks
  fix_plugin_yarn_locks

else
  echo "Building all plugins (default behavior)"
  # Export all plugins (default behavior)
  $RHDH_CLI plugin package --export-to "${PARENT_DIR}/dynamic-plugins"

  # Fix symlinks in exported plugins
  fix_plugin_symlinks
  fix_plugin_yarn_locks
fi

echo "Dynamic plugins built successfully"
