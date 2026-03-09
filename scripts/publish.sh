#!/usr/bin/env bash
set -euo pipefail

bump="${1:-patch}"

if [[ "$bump" != "patch" && "$bump" != "minor" && "$bump" != "major" ]]; then
  echo "Usage: ./scripts/publish.sh [patch|minor|major]"
  exit 1
fi

npm version "$bump" --no-git-tag-version

version=$(node -p "require('./package.json').version")

jj describe -m "chore: bump version to $version"

npm publish
