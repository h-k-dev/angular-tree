#!/usr/bin/env bash
# Publishes the already-built library to GitHub Packages.
# Invoked by @semantic-release/exec AFTER @semantic-release/npm has published
# to npmjs.org, so dist/angular-tree/package.json already carries the
# correct, semantic-release-computed version.
#
# Args:
#   $1 - nextRelease.version (unused but kept for clarity/logging)
#   $2 - nextRelease.channel (dist-tag; empty on the default branch -> "latest")
set -euo pipefail

VERSION="${1:-}"
TAG="${2:-}"
[ -z "$TAG" ] && TAG="latest"

DIST_DIR="./dist/angular-tree"
PKG_JSON="${DIST_DIR}/package.json"
NPMRC="$(mktemp)"
trap 'rm -f "$NPMRC"' EXIT

echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > "$NPMRC"

# publishConfig.registry wins over the --registry flag, so point it at GitHub
# Packages for this publish. The dist folder is ephemeral, so this is safe.
node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));j.publishConfig={...(j.publishConfig||{}),registry:'https://npm.pkg.github.com/'};fs.writeFileSync(p,JSON.stringify(j,null,2));" "$PKG_JSON"

echo "Publishing ${VERSION:-current} to GitHub Packages with tag '${TAG}'..."
npm publish "$DIST_DIR" \
  --userconfig "$NPMRC" \
  --registry https://npm.pkg.github.com/ \
  --tag "$TAG" \
  --provenance=false
