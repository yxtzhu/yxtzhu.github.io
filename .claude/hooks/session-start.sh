#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install gh CLI if not present
if ! command -v gh &> /dev/null; then
  echo "Installing gh CLI..."
  GH_VERSION="2.65.0"
  GH_ARCHIVE="gh_${GH_VERSION}_linux_amd64.tar.gz"
  curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ARCHIVE}" \
    -o "/tmp/${GH_ARCHIVE}"
  tar -xzf "/tmp/${GH_ARCHIVE}" -C /tmp/
  cp "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh
  rm -rf "/tmp/${GH_ARCHIVE}" "/tmp/gh_${GH_VERSION}_linux_amd64"
fi

# Install npm dependencies
if [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
  echo "Installing npm dependencies..."
  cd "$CLAUDE_PROJECT_DIR"
  npm install --ignore-scripts
fi
