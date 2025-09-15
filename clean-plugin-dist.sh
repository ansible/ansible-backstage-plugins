#!/bin/bash

set -e

# Variables
pluginsDir="plugins"

echo "Cleaning dist and dist-dynamic folders from all plugins..."

# Check if the plugins directory exists
if [ ! -d "$pluginsDir" ]; then
  echo "The directory $pluginsDir does not exist."
  exit 1
fi

# Loop through each subdirectory in the ./plugins directory
for pluginDir in "$pluginsDir"/*; do
  if [ -d "$pluginDir" ]; then
    pluginName=$(basename "$pluginDir")
    echo "Processing plugin: $pluginName"

    # Remove dist folder if it exists
    if [ -d "$pluginDir/dist" ]; then
      echo "  Removing $pluginDir/dist"
      rm -rf "$pluginDir/dist"
    fi

    # Remove dist-dynamic folder if it exists
    if [ -d "$pluginDir/dist-dynamic" ]; then
      echo "  Removing $pluginDir/dist-dynamic"
      rm -rf "$pluginDir/dist-dynamic"
    fi

    # Remove dist-types folder if it exists
    if [ -d "$pluginDir/dist-types" ]; then
      echo "  Removing $pluginDir/dist-types"
      rm -rf "$pluginDir/dist-types"
    fi
  fi
done

echo "Completed cleaning all plugin directories."
