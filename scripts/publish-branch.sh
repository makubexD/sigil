#!/usr/bin/env bash
#
# Publish a built artifact directory to an orphan branch, tagged for pinning.
#
# Run by .github/workflows/release.yml from the repository checkout, with GITHUB_REF_NAME
# (the release tag) and RUNNER_TEMP set by the runner. Usage:
#
#   publish-branch.sh <branch> <tag-prefix> <source-dir>
#
# See docs/decisions/publish-claude-marketplace-2026-10.md.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: scripts/publish-branch.sh <branch> <tag-prefix> <source-dir>" >&2
  exit 2
fi

BRANCH="$1"
TAG_PREFIX="$2"
SOURCE="$3"

if [ ! -d "$SOURCE" ]; then
  echo "Source directory does not exist: $SOURCE" >&2
  exit 2
fi

BR="$RUNNER_TEMP/branch-$BRANCH"
TAG="${TAG_PREFIX}${GITHUB_REF_NAME}"

# Publish only from the newest release tag: a backport never rolls users back.
LATEST=$(git -c versionsort.suffix=- ls-remote --tags --refs --sort=-v:refname origin "v*.*.*" | sed -n 1p | sed 's|.*refs/tags/||')
if [ "$GITHUB_REF_NAME" != "$LATEST" ]; then
  echo "::notice::$GITHUB_REF_NAME is not the newest release ($LATEST); the $BRANCH branch stays on the newest one"
  exit 0
fi

# An already published tag is a no-op, so re-running a release is safe.
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" > /dev/null; then
  echo "::notice::$TAG is already published; nothing to do"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# First publish has no $BRANCH branch yet: start an orphan one.
if git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null; then
  git fetch --depth=1 origin "$BRANCH:refs/remotes/origin/$BRANCH"
  git worktree add -B "$BRANCH" "$BR" origin/"$BRANCH"
else
  git worktree add --orphan -b "$BRANCH" "$BR"
fi

# Keep `.git/`; replace everything else with the fresh build.
find "$BR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$SOURCE/." "$BR/"

cd "$BR"
git add -A

if git diff --cached --quiet; then
  echo "$BRANCH unchanged; tagging the existing commit"
else
  git commit -m "$BRANCH: $GITHUB_REF_NAME"
fi

git tag "$TAG"
git push --atomic origin "$BRANCH" "refs/tags/$TAG"
