#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Only create PRs for claude/* branches
CURRENT_BRANCH=$(git -C "${CLAUDE_PROJECT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [[ "$CURRENT_BRANCH" != claude/* ]]; then
  exit 0
fi

# Skip if branch has no commits ahead of master/main
DEFAULT_BRANCH=$(git -C "${CLAUDE_PROJECT_DIR}" remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}' || echo "master")
COMMITS_AHEAD=$(git -C "${CLAUDE_PROJECT_DIR}" rev-list --count "origin/${DEFAULT_BRANCH}..HEAD" 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD" -eq 0 ]; then
  exit 0
fi

# Check if a PR already exists for this branch
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --json number --jq '.[0].number' 2>/dev/null || echo "")
if [ -n "$EXISTING_PR" ]; then
  PR_URL=$(gh pr view "$EXISTING_PR" --json url --jq '.url' 2>/dev/null || echo "")
  echo "PR already exists: $PR_URL"
  exit 0
fi

# Generate PR title from branch name (strip claude/ prefix and session id suffix)
PR_TITLE=$(echo "$CURRENT_BRANCH" | sed 's|^claude/||' | sed 's/-[a-zA-Z0-9]*$//' | tr '-' ' ' | sed 's/\b\(.\)/\u\1/g')

# Create the PR
gh pr create \
  --base "$DEFAULT_BRANCH" \
  --head "$CURRENT_BRANCH" \
  --title "$PR_TITLE" \
  --body "Automated PR created by Claude Code session.

Branch: \`$CURRENT_BRANCH\`" \
  2>/dev/null && echo "PR created successfully." || echo "Could not create PR (may need GITHUB_TOKEN configured)."
